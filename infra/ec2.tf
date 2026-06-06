data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "smartbib" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.smartbib.key_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.smartbib.id]
  user_data              = templatefile("${path.module}/user_data.sh", {
    github_repo = var.github_repo
    jwt_secret  = local.jwt_secret
    nginx_conf  = file("${path.module}/nginx.conf")
  })

  tags = {
    Name = "smartbib-backend"
  }

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }
}