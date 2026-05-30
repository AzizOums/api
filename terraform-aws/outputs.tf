output "backend_url" {
  value = "https://${aws_apprunner_service.backend.service_url}"
}

output "client_url" {
  value = "https://${aws_apprunner_service.client.service_url}"
}

output "admin_url" {
  value = "https://${aws_apprunner_service.admin.service_url}"
}

output "ecr_registry" {
  description = "ECR registry prefix for docker push"
  value       = "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com/${local.prefix}"
}

output "s3_bucket" {
  value = aws_s3_bucket.documents.bucket
}

output "knowledge_base_id" {
  value = aws_bedrockagent_knowledge_base.rag.id
}

output "data_source_id" {
  value = aws_bedrockagent_data_source.s3.data_source_id
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.address
}
