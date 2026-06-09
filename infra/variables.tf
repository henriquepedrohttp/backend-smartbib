variable "aws_region" {
  description = "Regiao AWS onde os recursos serao criados"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "Tipo da instancia EC2"
  type        = string
  default     = "t3.micro"
}

variable "github_repo" {
  description = "URL do repositorio Git do backend"
  type        = string
  default     = "https://github.com/henriquepedrohttp/backend-smartbib.git"
}

variable "jwt_secret" {
  description = "Secret JWT para o backend. Se vazio, sera gerado automaticamente."
  type        = string
  default     = ""
  sensitive   = true
}

variable "key_name" {
  description = "Nome do key pair SSH"
  type        = string
  default     = "smartbib-key"
}

variable "db_name" {
  description = "Nome do banco de dados PostgreSQL"
  type        = string
  default     = "smartbib"
}

variable "db_username" {
  description = "Usuario do banco de dados PostgreSQL"
  type        = string
  default     = "smartbib"
}

variable "db_password" {
  description = "Senha do banco de dados PostgreSQL"
  type        = string
  sensitive   = true
}
