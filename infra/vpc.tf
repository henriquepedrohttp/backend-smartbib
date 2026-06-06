resource "aws_vpc" "smartbib" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "smartbib-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.smartbib.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "smartbib-public-subnet"
  }
}

resource "aws_internet_gateway" "smartbib" {
  vpc_id = aws_vpc.smartbib.id

  tags = {
    Name = "smartbib-igw"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.smartbib.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id  = aws_internet_gateway.smartbib.id
  }

  tags = {
    Name = "smartbib-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}