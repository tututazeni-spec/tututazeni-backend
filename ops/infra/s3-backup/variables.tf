variable "primary_region" {
  description = "Região AWS do bucket principal de backup"
  type        = string
  default     = "eu-south-1"
}

variable "replica_region" {
  description = "Região AWS do bucket de replicação (deve ser diferente da principal)"
  type        = string
  default     = "eu-west-1"
}

variable "bucket_name" {
  description = "Nome do bucket S3 principal (globalmente único)"
  type        = string
  default     = "innova-backups-prod"
}

variable "retention_days_standard" {
  description = "Dias em STANDARD_IA antes de transitar para Glacier"
  type        = number
  default     = 90
}

variable "retention_days_glacier" {
  description = "Dias em Glacier antes de apagar (contados desde a criação)"
  type        = number
  default     = 365
}

variable "object_lock_days" {
  description = "Dias de retenção mínima via Object Lock (Governance mode). Impede deleção durante este período mesmo com credenciais comprometidas."
  type        = number
  default     = 35
}

variable "iam_backup_user_name" {
  description = "Nome do utilizador IAM para escrita de backups (permissões mínimas)"
  type        = string
  default     = "innova-backup-writer"
}

variable "iam_restore_user_name" {
  description = "Nome do utilizador IAM para restore (só leitura)"
  type        = string
  default     = "innova-backup-reader"
}

variable "environment" {
  description = "Ambiente (prod, staging)"
  type        = string
  default     = "prod"
}
