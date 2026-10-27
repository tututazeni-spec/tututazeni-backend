variable "region" {
  description = "Região AWS do bucket de ficheiros"
  type        = string
  default     = "eu-south-1"
}

variable "bucket_name" {
  description = "Nome do bucket de ficheiros dos utilizadores (globalmente único)"
  type        = string
  default     = "innova-files-prod"
}

variable "allowed_origins" {
  description = "Origens do frontend autorizadas a ler/enviar ficheiros (CORS). Ex.: [\"https://app.innova.ao\"]"
  type        = list(string)
}

variable "noncurrent_version_days" {
  description = "Dias que as versões antigas/apagadas ficam recuperáveis antes de serem eliminadas"
  type        = number
  default     = 90
}
