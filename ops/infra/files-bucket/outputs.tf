output "bucket_name" {
  description = "Nome do bucket de ficheiros"
  value       = aws_s3_bucket.files.id
}

output "bucket_regional_domain" {
  description = "Domínio regional do bucket (origem da CDN; usar o domínio da CDN em STORAGE_BASE_URL)"
  value       = aws_s3_bucket.files.bucket_regional_domain_name
}
