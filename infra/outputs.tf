output "public_ip" {
  description = "IP publico da instancia EC2 (Elastic IP - fixo)"
  value       = aws_eip.smartbib.public_ip
}

output "backend_url" {
  description = "URL do health check do backend"
  value       = "http://${aws_eip.smartbib.public_ip}/api/health"
}

output "ssh_command" {
  description = "Comando para acessar a instancia via SSH"
  value       = "ssh -i ${path.module}/smartbib-key.pem ubuntu@${aws_eip.smartbib.public_ip}"
}