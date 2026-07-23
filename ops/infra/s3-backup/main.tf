# ============================================================
# INNOVA — S3 Backup Infrastructure
#
# Cria:
#   • Bucket principal (eu-south-1) com Object Lock, versioning,
#     encriptação SSE-S3, bloqueio de acesso público
#   • Bucket de réplica (eu-west-1) para isolamento geográfico
#   • Replicação automática primary → replica
#   • Lifecycle: STANDARD_IA → Glacier → Expirar
#   • IAM role de replicação
#
# Uso:
#   cd ops/infra/s3-backup
#   terraform init
#   terraform plan -out=tfplan
#   terraform apply tfplan
# ============================================================

# ══════════════════════════════════════════════════════════════
# BUCKET PRINCIPAL
# ══════════════════════════════════════════════════════════════

resource "aws_s3_bucket" "backup_primary" {
  bucket = var.bucket_name

  # Object Lock requer que seja activado na criação — não pode ser adicionado depois
  object_lock_enabled = true

  lifecycle {
    prevent_destroy = true  # Terraform não apaga este bucket acidentalmente
  }
}

# Bloquear todo o acesso público (backups nunca devem ser públicos)
resource "aws_s3_bucket_public_access_block" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning (obrigatório para Object Lock e replicação)
resource "aws_s3_bucket_versioning" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Encriptação server-side com chave gerida pela AWS (SSE-S3)
# Para compliance mais estrito, usar SSE-KMS com chave própria
resource "aws_s3_bucket_server_side_encryption_configuration" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Object Lock em Governance mode:
#   • Qualquer tentativa de deletar um objeto dentro do período é bloqueada
#   • Mesmo credenciais comprometidas não conseguem apagar
#   • Pode ser overrideado por admin com permissão s3:BypassGovernanceRetention
#     (vs Compliance mode que é absolutamente irrevogável)
resource "aws_s3_bucket_object_lock_configuration" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = var.object_lock_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.backup_primary]
}

# Lifecycle: mover backups antigos para storage mais barato, depois expirar
resource "aws_s3_bucket_lifecycle_configuration" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  # Backups pg_dump e WAL-G
  rule {
    id     = "backup-tiering"
    status = "Enabled"

    filter {
      prefix = ""  # Aplica a todos os objectos
    }

    # Após 90 dias → Glacier Instant Retrieval (acesso em ms, custo 68% menor)
    transition {
      days          = var.retention_days_standard
      storage_class = "GLACIER_IR"
    }

    # Após 365 dias → expirar (apagar versão actual)
    expiration {
      days = var.retention_days_glacier
    }

    # Limpar versões antigas (após Object Lock expirar)
    noncurrent_version_expiration {
      noncurrent_days = var.object_lock_days + 5  # margem de segurança
    }

    # Limpar delete markers órfãos
    expiration {
      expired_object_delete_marker = true
    }
  }

  depends_on = [aws_s3_bucket_versioning.backup_primary]
}

# Política do bucket: forçar HTTPS e bloquear puts sem encriptação
resource "aws_s3_bucket_policy" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonHTTPS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.backup_primary.arn,
          "${aws_s3_bucket.backup_primary.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid       = "DenyUnencryptedPuts"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.backup_primary.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "AES256"
          }
          Null = {
            "s3:x-amz-server-side-encryption" = "false"
          }
        }
      },
      {
        Sid    = "AllowBackupWriter"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_user.backup_writer.arn
        }
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.backup_primary.arn,
          "${aws_s3_bucket.backup_primary.arn}/*"
        ]
      },
      {
        Sid    = "AllowBackupReader"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_user.backup_reader.arn
        }
        Action = [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:GetObjectVersion"
        ]
        Resource = [
          aws_s3_bucket.backup_primary.arn,
          "${aws_s3_bucket.backup_primary.arn}/*"
        ]
      },
      {
        Sid    = "AllowReplication"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.replication.arn
        }
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Resource = "${aws_s3_bucket.backup_primary.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.backup_primary]
}

# ══════════════════════════════════════════════════════════════
# BUCKET DE RÉPLICA (região diferente = isolamento real)
# ══════════════════════════════════════════════════════════════

resource "aws_s3_bucket" "backup_replica" {
  provider = aws.replica
  bucket   = "${var.bucket_name}-replica-${var.replica_region}"

  object_lock_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "backup_replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.backup_replica.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "backup_replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.backup_replica.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup_replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.backup_replica.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_object_lock_configuration" "backup_replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.backup_replica.id

  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = var.object_lock_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.backup_replica]
}

# ══════════════════════════════════════════════════════════════
# REPLICAÇÃO PRIMARY → REPLICA
# ══════════════════════════════════════════════════════════════

resource "aws_iam_role" "replication" {
  name = "innova-s3-backup-replication"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "s3.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "replication" {
  name = "innova-s3-replication-policy"
  role = aws_iam_role.replication.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.backup_primary.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Resource = "${aws_s3_bucket.backup_primary.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags",
          "s3:ObjectOwnerOverrideToBucketOwner"
        ]
        Resource = "${aws_s3_bucket.backup_replica.arn}/*"
      }
    ]
  })
}

resource "aws_s3_bucket_replication_configuration" "primary_to_replica" {
  bucket = aws_s3_bucket.backup_primary.id
  role   = aws_iam_role.replication.arn

  rule {
    id     = "replicate-all"
    status = "Enabled"

    filter {}

    destination {
      bucket        = aws_s3_bucket.backup_replica.arn
      storage_class = "STANDARD_IA"

      replication_time {
        status = "Enabled"
        time { minutes = 15 }
      }

      metrics {
        status = "Enabled"
        event_threshold { minutes = 15 }
      }
    }

    delete_marker_replication {
      status = "Enabled"
    }
  }

  depends_on = [
    aws_s3_bucket_versioning.backup_primary,
    aws_s3_bucket_versioning.backup_replica
  ]
}
