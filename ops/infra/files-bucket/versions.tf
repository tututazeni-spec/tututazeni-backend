terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Guardar o state num backend remoto antes de uso real (ver ops/infra/s3-backup/versions.tf).
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "innova"
      ManagedBy = "terraform"
      Component = "files"
    }
  }
}
