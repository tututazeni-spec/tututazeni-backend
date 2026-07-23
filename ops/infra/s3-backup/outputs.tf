output "primary_bucket_name" {
  description = "Nome do bucket S3 principal de backup"
  value       = aws_s3_bucket.backup_primary.id
}

output "primary_bucket_arn" {
  description = "ARN do bucket S3 principal de backup"
  value       = aws_s3_bucket.backup_primary.arn
}

output "replica_bucket_name" {
  description = "Nome do bucket S3 de réplica (outra região)"
  value       = aws_s3_bucket.backup_replica.id
}

output "replica_bucket_arn" {
  description = "ARN do bucket S3 de réplica"
  value       = aws_s3_bucket.backup_replica.arn
}

output "backup_writer_access_key_id" {
  description = "AWS_ACCESS_KEY_ID para o cron de backup (guardar no .env.production e walg.env)"
  value       = aws_iam_access_key.backup_writer.id
  sensitive   = true
}

output "backup_writer_secret_access_key" {
  description = "AWS_SECRET_ACCESS_KEY para o cron de backup — guardar imediatamente, não fica visível depois"
  value       = aws_iam_access_key.backup_writer.secret
  sensitive   = true
}

output "backup_reader_access_key_id" {
  description = "AWS_ACCESS_KEY_ID para restores e auditorias"
  value       = aws_iam_access_key.backup_reader.id
  sensitive   = true
}

output "backup_reader_secret_access_key" {
  description = "AWS_SECRET_ACCESS_KEY para restores"
  value       = aws_iam_access_key.backup_reader.secret
  sensitive   = true
}

output "env_production_snippet" {
  description = "Bloco pronto a colar no .env.production"
  value = <<-ENV
    # ── Backups PostgreSQL → AWS S3 ──
    BACKUP_S3_BUCKET=${aws_s3_bucket.backup_primary.id}
    BACKUP_S3_PREFIX=innova/postgres
    AWS_ACCESS_KEY_ID=<ver terraform output backup_writer_access_key_id>
    AWS_SECRET_ACCESS_KEY=<ver terraform output backup_writer_secret_access_key>
    AWS_DEFAULT_REGION=${var.primary_region}
    BACKUP_RETENTION_DAYS=30
    BACKUP_ENCRYPT_PASSPHRASE=<gerar com: openssl rand -base64 32>
    BACKUP_MAX_AGE_HOURS=26
  ENV
  sensitive = false
}
