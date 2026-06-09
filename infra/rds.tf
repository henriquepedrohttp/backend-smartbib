resource "aws_db_subnet_group" "smartbib" {
  name       = "smartbib-db-subnet-group"
  subnet_ids = [aws_subnet.public.id, aws_subnet.public_az2.id]

  tags = {
    Name = "smartbib-db-subnet-group"
  }
}

resource "aws_db_instance" "smartbib" {
  identifier             = "smartbib-db"
  engine                 = "postgres"
  engine_version         = "16.4"
  instance_class         = "db.t4g.micro"
  allocated_storage      = 20
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.smartbib.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  publicly_accessible    = false

  backup_retention_period = 0
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  tags = {
    Name = "smartbib-rds"
  }
}
