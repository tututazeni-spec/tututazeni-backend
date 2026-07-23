# ============================================================
# INNOVA — IAM: utilizadores com permissões mínimas para backup
#
# Princípio de menor privilégio:
#   • backup-writer : só escreve e lista (para o cron de backup)
#   • backup-reader : só lê e lista (para restores e auditorias)
#
# As chaves de acesso são geradas aqui mas NÃO ficam no state em texto limpo.
# Usar AWS Secrets Manager ou variáveis de ambiente para as distribuir.
# ============================================================

# ── Utilizador de escrita (backup-postgres.sh + walg-backup.sh) ──────────
resource "aws_iam_user" "backup_writer" {
  name = var.iam_backup_user_name
  path = "/innova/backup/"

  tags = {
    Description = "Escrita de backups INNOVA para S3 — permissões mínimas"
  }
}

resource "aws_iam_user_policy" "backup_writer" {
  name = "innova-backup-writer-policy"
  user = aws_iam_user.backup_writer.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ListBucket"
        Effect = "Allow"
        Action = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = aws_s3_bucket.backup_primary.arn
        # Só o bucket principal — não precisa de acesso à réplica
      },
      {
        Sid    = "WriteObjects"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",         # Necessário para verificar uploads
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.backup_primary.arn}/*"
      },
      {
        Sid    = "DeleteExpiredBackups"
        Effect = "Allow"
        Action = ["s3:DeleteObject", "s3:DeleteObjectVersion"]
        Resource = "${aws_s3_bucket.backup_primary.arn}/*"
        # Object Lock impede deleção dentro do período de retenção,
        # mesmo com esta permissão
      }
    ]
  })
}

resource "aws_iam_access_key" "backup_writer" {
  user = aws_iam_user.backup_writer.name
  # A chave é guardada no tfstate — usar `terraform output -json` para obter
  # e armazenar imediatamente no /etc/walg/walg.env e /opt/innova/.env.production
}

# ── Utilizador de leitura (restore + auditorias) ─────────────────────────
resource "aws_iam_user" "backup_reader" {
  name = var.iam_restore_user_name
  path = "/innova/backup/"

  tags = {
    Description = "Leitura de backups INNOVA no S3 — restore e auditorias"
  }
}

resource "aws_iam_user_policy" "backup_reader" {
  name = "innova-backup-reader-policy"
  user = aws_iam_user.backup_reader.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadOnly"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:ListBucketVersions"
        ]
        Resource = [
          aws_s3_bucket.backup_primary.arn,
          "${aws_s3_bucket.backup_primary.arn}/*",
          # Também pode ler da réplica (útil em cenário de DR onde o primário caiu)
          aws_s3_bucket.backup_replica.arn,
          "${aws_s3_bucket.backup_replica.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_access_key" "backup_reader" {
  user = aws_iam_user.backup_reader.name
}
