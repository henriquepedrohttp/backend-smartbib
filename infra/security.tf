resource "aws_security_group" "smartbib" {
  name        = "smartbib-sg"
  description = "Security group para o backend SmartBib"
  vpc_id      = aws_vpc.smartbib.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "smartbib-sg"
  }
}

resource "aws_security_group" "rds" {
  name        = "smartbib-rds-sg"
  description = "Security group para o RDS PostgreSQL"
  vpc_id      = aws_vpc.smartbib.id

  ingress {
    description     = "PostgreSQL from EC2"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.smartbib.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "smartbib-rds-sg"
  }
}
