#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

echo "[SmartBib] Iniciando configuracao da instancia..."

echo "[SmartBib] Atualizando pacotes..."
apt-get update -y
apt-get upgrade -y

echo "[SmartBib] Instalando Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "[SmartBib] Instalando nginx e git..."
apt-get install -y nginx git

echo "[SmartBib] Configurando nginx..."
cat > /etc/nginx/sites-available/smartbib << 'NGINX_EOF'
${nginx_conf}
NGINX_EOF

ln -sf /etc/nginx/sites-available/smartbib /etc/nginx/sites-enabled/smartbib
rm -f /etc/nginx/sites-enabled/default
nginx -t

echo "[SmartBib] Clonando repositorio..."
rm -rf /opt/smartbib
git clone ${github_repo} /opt/smartbib

echo "[SmartBib] Instalando dependencias e buildando..."
cd /opt/smartbib
npm install
npm run build

echo "[SmartBib] Criando arquivo .env..."
cat > /opt/smartbib/.env << ENV_EOF
PORT=3000
JWT_SECRET=${jwt_secret}
ENV_EOF

echo "[SmartBib] Criando systemd service..."
cat > /etc/systemd/system/smartbib.service << SVC_EOF
[Unit]
Description=SmartBib Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/smartbib
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SVC_EOF

echo "[SmartBib] Ajustando permissoes..."
chown -R ubuntu:ubuntu /opt/smartbib

echo "[SmartBib] Iniciando servicos..."
systemctl daemon-reload
systemctl enable smartbib
systemctl start smartbib
systemctl enable nginx
systemctl restart nginx

echo "[SmartBib] Configuracao concluida!"