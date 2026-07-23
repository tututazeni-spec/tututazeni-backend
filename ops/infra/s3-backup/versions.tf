terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Usar backend S3 para o state (criar bucket manualmente antes do primeiro apply)
  # backend "s3" {
  #   bucket         = "innova-terraform-state"
  #   key            = "infra/s3-backup/terraform.tfstate"
  #   region         = "eu-south-1"
  #   encrypt        = true
  #   dynamodb_table = "innova-terraform-locks"
  # }
}

provider "aws" {
  region = var.primary_region

  default_tags {
    tags = {
      Project     = "innova"
      ManagedBy   = "terraform"
      Component   = "backup"
    }
  }
}

# Provider secundário para bucket de replicação (região diferente = isolamento real)
provider "aws" {
  alias  = "replica"
  region = var.replica_region

  default_tags {
    tags = {
      Project     = "innova"
      ManagedBy   = "terraform"
      Component   = "backup-replica"
    }
  }
}
