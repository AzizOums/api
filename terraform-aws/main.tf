locals {
  prefix     = "${var.environment}-rag"
  account_id = data.aws_caller_identity.current.account_id
}

# ── VPC ───────────────────────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

data "aws_availability_zones" "available" { state = "available" }

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_eip" "nat" {
  domain = "vpc"
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.igw]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ── Security Groups ───────────────────────────────────────────────────────────
resource "aws_security_group" "apprunner" {
  name   = "${local.prefix}-apprunner"
  vpc_id = aws_vpc.main.id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name   = "${local.prefix}-rds"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.apprunner.id]
  }
}

# ── ECR ───────────────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "rag" {
  for_each             = toset(["backend", "frontend-client", "frontend-admin"])
  name                 = "${local.prefix}/${each.key}"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_lifecycle_policy" "rag" {
  for_each   = aws_ecr_repository.rag
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ── S3 ────────────────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "documents" {
  bucket        = "${local.account_id}-${local.prefix}-docs"
  force_destroy = var.environment != "prod"
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── RDS PostgreSQL ────────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "rag" {
  name       = "${local.prefix}-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "postgres" {
  identifier              = "${local.prefix}-db"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = var.environment == "prod" ? "db.t3.medium" : "db.t3.micro"
  allocated_storage       = 20
  db_name                 = "rag"
  username                = "rag"
  password                = var.db_password
  db_subnet_group_name    = aws_db_subnet_group.rag.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  skip_final_snapshot     = var.environment != "prod"
  deletion_protection     = var.environment == "prod"
  backup_retention_period = var.environment == "prod" ? 7 : 0
  publicly_accessible     = false
  parameter_group_name    = aws_db_parameter_group.postgres.name
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${local.prefix}-pg16"
  family = "postgres16"
  # pgvector is available as a built-in extension in RDS PostgreSQL 15+
}

# ── Secrets Manager ───────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "db_url" {
  name                    = "${local.prefix}/db-url"
  recovery_window_in_days = var.environment == "prod" ? 7 : 0
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql://${aws_db_instance.postgres.username}:${var.db_password}@${aws_db_instance.postgres.address}:5432/${aws_db_instance.postgres.db_name}"
}

resource "aws_secretsmanager_secret" "secret_key" {
  name                    = "${local.prefix}/secret-key"
  recovery_window_in_days = var.environment == "prod" ? 7 : 0
}

resource "aws_secretsmanager_secret_version" "secret_key" {
  secret_id     = aws_secretsmanager_secret.secret_key.id
  secret_string = var.secret_key
}

# ── IAM — Bedrock Knowledge Base role ────────────────────────────────────────
resource "aws_iam_role" "bedrock_kb" {
  name = "${local.prefix}-bedrock-kb"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "bedrock.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = local.account_id }
      }
    }]
  })
}

resource "aws_iam_role_policy" "bedrock_kb" {
  role = aws_iam_role.bedrock_kb.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:aws:bedrock:${var.region}::foundation-model/${var.bedrock_embedding_model}"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.documents.arn, "${aws_s3_bucket.documents.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["aoss:APIAccessAll"]
        Resource = aws_opensearchserverless_collection.kb.arn
      }
    ]
  })
}

# ── IAM — App Runner ECR access role (for image pulling) ─────────────────────
resource "aws_iam_role" "apprunner_ecr" {
  name = "${local.prefix}-apprunner-ecr"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr" {
  role       = aws_iam_role.apprunner_ecr.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# ── IAM — App Runner instance role (for the running app) ─────────────────────
resource "aws_iam_role" "apprunner_instance" {
  name = "${local.prefix}-apprunner-instance"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "tasks.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "apprunner_instance" {
  role = aws_iam_role.apprunner_instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockInvoke"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = "*"
      },
      {
        Sid    = "BedrockKB"
        Effect = "Allow"
        Action = [
          "bedrock-agent-runtime:Retrieve",
          "bedrock-agent:StartIngestionJob",
          "bedrock-agent:GetIngestionJob",
          "bedrock-agent:ListIngestionJobs",
        ]
        Resource = "*"
      },
      {
        Sid    = "S3Documents"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.documents.arn, "${aws_s3_bucket.documents.arn}/*"]
      },
      {
        Sid    = "Secrets"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.db_url.arn,
          aws_secretsmanager_secret.secret_key.arn,
        ]
      }
    ]
  })
}

# ── OpenSearch Serverless (vector backend for Bedrock KB) ─────────────────────
resource "aws_opensearchserverless_encryption_policy" "kb" {
  name = "${local.prefix}-kb"
  type = "encryption"
  policy = jsonencode({
    Rules    = [{ Resource = ["collection/${local.prefix}-kb"], ResourceType = "collection" }]
    AWSOwnedKey = true
  })
}

resource "aws_opensearchserverless_network_policy" "kb" {
  name = "${local.prefix}-kb"
  type = "network"
  policy = jsonencode([{
    Rules = [
      { Resource = ["collection/${local.prefix}-kb"], ResourceType = "collection" },
      { Resource = ["dashboard/${local.prefix}-kb"],  ResourceType = "dashboard" }
    ]
    AllowFromPublic = true
  }])
}

resource "aws_opensearchserverless_access_policy" "kb" {
  name = "${local.prefix}-kb"
  type = "data"
  policy = jsonencode([{
    Rules = [
      {
        Resource     = ["collection/${local.prefix}-kb"]
        Permission   = ["aoss:CreateCollectionItems", "aoss:DeleteCollectionItems", "aoss:UpdateCollectionItems", "aoss:DescribeCollectionItems"]
        ResourceType = "collection"
      },
      {
        Resource     = ["index/${local.prefix}-kb/*"]
        Permission   = ["aoss:CreateIndex", "aoss:DeleteIndex", "aoss:UpdateIndex", "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"]
        ResourceType = "index"
      }
    ]
    Principal = [aws_iam_role.bedrock_kb.arn, aws_iam_role.apprunner_instance.arn]
  }])
}

resource "aws_opensearchserverless_collection" "kb" {
  name = "${local.prefix}-kb"
  type = "VECTORSEARCH"
  depends_on = [
    aws_opensearchserverless_encryption_policy.kb,
    aws_opensearchserverless_network_policy.kb,
    aws_opensearchserverless_access_policy.kb,
  ]
}

# ── Bedrock Knowledge Base ────────────────────────────────────────────────────
resource "aws_bedrockagent_knowledge_base" "rag" {
  name     = "${local.prefix}-kb"
  role_arn = aws_iam_role.bedrock_kb.arn

  knowledge_base_configuration {
    type = "VECTOR"
    vector_knowledge_base_configuration {
      embedding_model_arn = "arn:aws:bedrock:${var.region}::foundation-model/${var.bedrock_embedding_model}"
    }
  }

  storage_configuration {
    type = "OPENSEARCH_SERVERLESS"
    opensearch_serverless_configuration {
      collection_arn    = aws_opensearchserverless_collection.kb.arn
      vector_index_name = "rag-index"
      field_mapping {
        vector_field   = "embedding"
        text_field     = "AMAZON_BEDROCK_TEXT_CHUNK"
        metadata_field = "AMAZON_BEDROCK_METADATA"
      }
    }
  }

  depends_on = [aws_iam_role_policy.bedrock_kb]
}

resource "aws_bedrockagent_data_source" "s3" {
  knowledge_base_id = aws_bedrockagent_knowledge_base.rag.id
  name              = "${local.prefix}-s3"

  data_source_configuration {
    type = "S3"
    s3_configuration {
      bucket_arn = aws_s3_bucket.documents.arn
    }
  }

  vector_ingestion_configuration {
    chunking_configuration {
      chunking_strategy = "FIXED_SIZE"
      fixed_size_chunking_configuration {
        max_tokens         = 300
        overlap_percentage = 20
      }
    }
  }
}

# ── App Runner — VPC Connector ────────────────────────────────────────────────
resource "aws_apprunner_vpc_connector" "connector" {
  vpc_connector_name = "${local.prefix}-connector"
  subnets            = aws_subnet.private[*].id
  security_groups    = [aws_security_group.apprunner.id]
}

# ── App Runner — Backend ──────────────────────────────────────────────────────
resource "aws_apprunner_service" "backend" {
  service_name = "${local.prefix}-backend"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr.arn
    }
    image_repository {
      image_identifier      = "${aws_ecr_repository.rag["backend"].repository_url}:latest"
      image_repository_type = "ECR"
      image_configuration {
        port = "8080"
        runtime_environment_variables = {
          LLM_PROVIDER               = "bedrock"
          VECTOR_STORE               = "bedrock"
          STORAGE_PROVIDER           = "s3"
          AWS_REGION                 = var.region
          S3_BUCKET_NAME             = aws_s3_bucket.documents.bucket
          BEDROCK_LLM_MODEL          = "anthropic.claude-3-5-sonnet-20241022-v2:0"
          BEDROCK_KNOWLEDGE_BASE_ID  = aws_bedrockagent_knowledge_base.rag.id
          BEDROCK_DATA_SOURCE_ID     = aws_bedrockagent_data_source.s3.data_source_id
          ADMIN_EMAIL                = var.admin_email
          ADMIN_PASSWORD             = var.admin_password
        }
        runtime_environment_secrets = {
          DATABASE_URL = aws_secretsmanager_secret_version.db_url.arn
          SECRET_KEY   = aws_secretsmanager_secret_version.secret_key.arn
        }
      }
    }
    auto_deployments_enabled = false
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.connector.arn
    }
  }

  instance_configuration {
    instance_role_arn = aws_iam_role.apprunner_instance.arn
    cpu               = "1024"
    memory            = "2048"
  }

  health_check_configuration {
    protocol = "HTTP"
    path     = "/health"
    interval = 10
  }
}

# ── App Runner — Frontend Client ──────────────────────────────────────────────
resource "aws_apprunner_service" "client" {
  service_name = "${local.prefix}-client"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr.arn
    }
    image_repository {
      image_identifier      = "${aws_ecr_repository.rag["frontend-client"].repository_url}:latest"
      image_repository_type = "ECR"
      image_configuration {
        port = "3000"
        runtime_environment_variables = {
          NEXT_PUBLIC_API_URL = "https://${aws_apprunner_service.backend.service_url}"
        }
      }
    }
    auto_deployments_enabled = false
  }

  instance_configuration { cpu = "512"; memory = "1024" }
}

# ── App Runner — Frontend Admin ───────────────────────────────────────────────
resource "aws_apprunner_service" "admin" {
  service_name = "${local.prefix}-admin"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr.arn
    }
    image_repository {
      image_identifier      = "${aws_ecr_repository.rag["frontend-admin"].repository_url}:latest"
      image_repository_type = "ECR"
      image_configuration {
        port = "3001"
        runtime_environment_variables = {
          NEXT_PUBLIC_API_URL = "https://${aws_apprunner_service.backend.service_url}"
        }
      }
    }
    auto_deployments_enabled = false
  }

  instance_configuration { cpu = "512"; memory = "1024" }
}
