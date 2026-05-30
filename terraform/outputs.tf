output "backend_url" {
  value = google_cloud_run_v2_service.backend.uri
}

output "client_url" {
  value = google_cloud_run_v2_service.client.uri
}

output "admin_url" {
  value = google_cloud_run_v2_service.admin.uri
}

output "documents_bucket" {
  value = google_storage_bucket.documents.name
}

output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/rag"
}

output "vector_search_index_id" {
  value = google_vertex_ai_index.rag.id
}

output "vector_search_endpoint_id" {
  value = google_vertex_ai_index_endpoint.rag.id
}

output "vector_search_deployed_index_id" {
  value = google_vertex_ai_index_endpoint_deployed_index.rag.deployed_index_id
}
