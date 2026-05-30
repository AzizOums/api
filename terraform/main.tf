# ── APIs ──────────────────────────────────────────────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "aiplatform.googleapis.com",
    "secretmanager.googleapis.com",
    "vpcaccess.googleapis.com",
    "servicenetworking.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# ── Network ───────────────────────────────────────────────────────────────────
resource "google_compute_network" "vpc" {
  name                    = "${var.environment}-rag-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${var.environment}-rag-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_compute_global_address" "private_ip" {
  name          = "${var.environment}-rag-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
  depends_on              = [google_project_service.apis]
}

resource "google_vpc_access_connector" "connector" {
  name         = "${var.environment}-rag-cx"
  region       = var.region
  subnet { name = google_compute_subnetwork.subnet.name }
  machine_type  = "e2-micro"
  min_instances = 2
  max_instances = 3
  depends_on    = [google_project_service.apis]
}

# ── Artifact Registry ─────────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "rag" {
  location      = var.region
  repository_id = "rag"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

# ── Cloud Storage ─────────────────────────────────────────────────────────────
resource "google_storage_bucket" "documents" {
  name          = "${var.project_id}-${var.environment}-rag-docs"
  location      = var.region
  force_destroy = var.environment != "prod"
  uniform_bucket_level_access = true
  versioning { enabled = true }
}

# ── Cloud SQL (PostgreSQL) ────────────────────────────────────────────────────
resource "google_sql_database_instance" "postgres" {
  name             = "${var.environment}-rag-db"
  database_version = "POSTGRES_16"
  region           = var.region
  depends_on       = [google_service_networking_connection.private_vpc]

  settings {
    tier = var.environment == "prod" ? "db-custom-2-7680" : "db-f1-micro"
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }
    backup_configuration { enabled = var.environment == "prod" }
  }
  deletion_protection = var.environment == "prod"
}

resource "google_sql_database" "rag" {
  name     = "rag"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "rag" {
  name     = "rag"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# ── Vertex AI Vector Search ───────────────────────────────────────────────────
resource "google_vertex_ai_index" "rag" {
  region       = var.region
  display_name = "${var.environment}-rag-index"
  depends_on   = [google_project_service.apis]

  metadata {
    contents_delta_uri = "gs://${google_storage_bucket.documents.name}/index-init"
    config {
      dimensions                  = 768
      approximate_neighbors_count = 150
      distance_measure_type       = "DOT_PRODUCT_DISTANCE"
      feature_norm_type           = "UNIT_L2_NORM"
      algorithm_config {
        tree_ah_config {
          leaf_node_embedding_count    = 500
          leaf_nodes_to_search_percent = 7
        }
      }
    }
  }

  index_update_method = "STREAM_UPDATE"
}

resource "google_vertex_ai_index_endpoint" "rag" {
  region       = var.region
  display_name = "${var.environment}-rag-endpoint"
  network      = "projects/${data.google_project.project.number}/global/networks/${google_compute_network.vpc.name}"
  depends_on   = [google_service_networking_connection.private_vpc]
}

resource "google_vertex_ai_index_endpoint_deployed_index" "rag" {
  index_endpoint   = google_vertex_ai_index_endpoint.rag.id
  index            = google_vertex_ai_index.rag.id
  deployed_index_id = "${var.environment}_rag_deployed"
  automatic_resources {
    min_replica_count = 1
    max_replica_count = var.environment == "prod" ? 3 : 1
  }
}

data "google_project" "project" {}

# ── Service Account ───────────────────────────────────────────────────────────
resource "google_service_account" "backend" {
  account_id   = "${var.environment}-rag-backend"
  display_name = "RAG Backend"
}

resource "google_project_iam_member" "vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_storage_bucket_iam_member" "backend_storage" {
  bucket = google_storage_bucket.documents.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend.email}"
}

# ── Secret Manager ────────────────────────────────────────────────────────────
resource "google_secret_manager_secret" "db_url" {
  secret_id  = "${var.environment}-rag-db-url"
  replication { auto {} }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "db_url" {
  secret      = google_secret_manager_secret.db_url.id
  secret_data = "postgresql://${google_sql_user.rag.name}:${var.db_password}@${google_sql_database_instance.postgres.private_ip_address}:5432/${google_sql_database.rag.name}"
}

resource "google_secret_manager_secret" "secret_key" {
  secret_id  = "${var.environment}-rag-secret-key"
  replication { auto {} }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "secret_key" {
  secret      = google_secret_manager_secret.secret_key.id
  secret_data = var.secret_key
}

resource "google_secret_manager_secret_access_iam_member" "db_url" {
  secret_id = google_secret_manager_secret.db_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_access_iam_member" "secret_key" {
  secret_id = google_secret_manager_secret.secret_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

# ── Cloud Run — Backend ───────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "backend" {
  name       = "${var.environment}-rag-backend"
  location   = var.region
  depends_on = [google_project_service.apis]

  template {
    service_account = google_service_account.backend.email
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/rag/backend:latest"
      env { name = "GCP_PROJECT_ID";  value = var.project_id }
      env { name = "GCS_BUCKET_NAME"; value = google_storage_bucket.documents.name }
      env { name = "ADMIN_EMAIL";     value = var.admin_email }
      env { name = "ADMIN_PASSWORD";  value = var.admin_password }
      env { name = "VECTOR_SEARCH_INDEX_ID";        value = google_vertex_ai_index.rag.id }
      env { name = "VECTOR_SEARCH_ENDPOINT_ID";     value = google_vertex_ai_index_endpoint.rag.id }
      env { name = "VECTOR_SEARCH_DEPLOYED_INDEX_ID"; value = google_vertex_ai_index_endpoint_deployed_index.rag.deployed_index_id }
      env {
        name = "DATABASE_URL"
        value_source { secret_key_ref { secret = google_secret_manager_secret.db_url.secret_id; version = "latest" } }
      }
      env {
        name = "SECRET_KEY"
        value_source { secret_key_ref { secret = google_secret_manager_secret.secret_key.secret_id; version = "latest" } }
      }
      resources { limits = { cpu = "1", memory = "1Gi" } }
    }
  }
}

# ── Cloud Run — Frontend Client ───────────────────────────────────────────────
resource "google_cloud_run_v2_service" "client" {
  name       = "${var.environment}-rag-client"
  location   = var.region
  depends_on = [google_project_service.apis]

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/rag/frontend-client:latest"
      env   { name = "NEXT_PUBLIC_API_URL"; value = google_cloud_run_v2_service.backend.uri }
      resources { limits = { cpu = "1", memory = "512Mi" } }
    }
  }
}

# ── Cloud Run — Frontend Admin ────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "admin" {
  name       = "${var.environment}-rag-admin"
  location   = var.region
  depends_on = [google_project_service.apis]

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/rag/frontend-admin:latest"
      env   { name = "NEXT_PUBLIC_API_URL"; value = google_cloud_run_v2_service.backend.uri }
      resources { limits = { cpu = "1", memory = "512Mi" } }
    }
  }
}

# ── IAM — public invokers ─────────────────────────────────────────────────────
resource "google_cloud_run_service_iam_member" "backend_public" {
  location = google_cloud_run_v2_service.backend.location
  service  = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_service_iam_member" "client_public" {
  location = google_cloud_run_v2_service.client.location
  service  = google_cloud_run_v2_service.client.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_service_iam_member" "admin_public" {
  location = google_cloud_run_v2_service.admin.location
  service  = google_cloud_run_v2_service.admin.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
