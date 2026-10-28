# ============================================================
# INNOVA — Bucket de ficheiros dos utilizadores (STORAGE_BASE_URL)
#
# A app guarda só o fileUrl; o ficheiro vive aqui. Ver docs/deploy/ficheiros-e-persistencia.md.
#   • Versioning: um ficheiro apagado ou trocado recupera-se durante N dias
#   • Encriptação SSE-S3 e bloqueio total de acesso público (acesso por CDN/URLs assinados)
#   • Lifecycle: versões antigas expiram; uploads multipart abandonados limpam-se
#   • CORS restrito ao domínio do frontend
#
# Uso:
#   cd ops/infra/files-bucket
#   terraform init
#   terraform plan -var 'allowed_origins=["https://app.innova.ao"]' -out=tfplan
#   terraform apply tfplan
# Depois: STORAGE_BASE_URL, ALLOWED_FILE_HOST e IMG_ALLOWED_HOSTS = domínio da CDN/bucket.
# ============================================================

resource "aws_s3_bucket" "files" {
  bucket = var.bucket_name

  lifecycle {
    prevent_destroy = true # nunca apagar o bucket de dados de utilizadores por engano
  }
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket = aws_s3_bucket.files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  # A configuração de versioning tem de existir antes das regras de versões antigas
  depends_on = [aws_s3_bucket_versioning.files]

  rule {
    id     = "expirar-versoes-antigas"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "limpar-marcadores-de-apagado"
    status = "Enabled"
    filter {}

    expiration {
      expired_object_delete_marker = true
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  cors_rule {
    allowed_origins = var.allowed_origins
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"] # a verificação remota usa GET condicional (If-None-Match)
    max_age_seconds = 3600
  }
}
