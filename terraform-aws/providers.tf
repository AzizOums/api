terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }

  # Uncomment after creating the bucket manually:
  # backend "s3" {
  #   bucket = "YOUR_ACCOUNT_ID-tf-state"
  #   key    = "rag/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "rag"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
