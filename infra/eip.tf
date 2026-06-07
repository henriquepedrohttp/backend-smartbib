resource "aws_eip" "smartbib" {
  domain = "vpc"

  tags = {
    Name = "smartbib-eip"
  }
}

resource "aws_eip_association" "smartbib" {
  instance_id   = aws_instance.smartbib.id
  allocation_id = aws_eip.smartbib.id
}