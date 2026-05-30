variable "region" {
  description = "AWS Region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment (dev / staging / prod)"
  type        = string
  default     = "dev"
}

variable "db_password" {
  description = "RDS postgres password"
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "JWT secret key (min 32 chars)"
  type        = string
  sensitive   = true
}

variable "admin_email" {
  type = string
}

variable "admin_password" {
  type      = string
  sensitive = true
}

variable "bedrock_embedding_model" {
  description = "Bedrock embedding model ARN for the Knowledge Base"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}
