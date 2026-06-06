terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  required_version = ">= 1.0"
}

provider "aws" {
  region = var.aws_region
}

resource "tls_private_key" "smartbib" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "smartbib" {
  key_name   = var.key_name
  public_key = tls_private_key.smartbib.public_key_openssh
}

resource "local_file" "private_key" {
  content         = tls_private_key.smartbib.private_key_pem
  filename        = "${path.module}/smartbib-key.pem"
  file_permission = "0600"
}

resource "random_password" "jwt_secret" {
  count   = var.jwt_secret == "" ? 1 : 0
  length  = 64
  special = false
}

locals {
  jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret[0].result
}