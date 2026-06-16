# Deploy SmartBib - PostgreSQL + Prisma + AWS RDS

## Visao Geral

```
LOCAL (dev)                     AWS (produção)
docker-compose up -d            EC2 t3.micro + RDS db.t4g.micro
PostgreSQL :5432               PostgreSQL 16.4
Prisma ORM                     Prisma ORM
```

---

## Resumo do que mudou

- **Antes:** SQLite em arquivo local (`sql.js`)
- **Depois:** PostgreSQL via Prisma ORM
- **Dev local:** Docker (`docker compose up -d`)
- **Produção:** AWS RDS free tier

Arquivos novos principais:

| Arquivo | Função |
|---|---|
| `prisma/schema.prisma` | Schema dos modelos User, Sala, Reserva |
| `prisma/migrations/` | Migrations versionadas |
| `prisma/seed.ts` | Popula 4 salas iniciais |
| `src/lib/prisma.ts` | Singleton do PrismaClient |
| `docker-compose.yml` | PostgreSQL local |
| `infra/rds.tf` | RDS PostgreSQL na AWS |

---

## Fluxo Completo de Deploy

### 1. Ambiente Local (testar antes de subir)

```bash
# Entrar na pasta do projeto
cd backend/

# Subir PostgreSQL no Docker
docker compose up -d

# Instalar dependencias
npm install

# Gerar migration e criar tabelas
npx prisma migrate dev --name init

# Popular dados iniciais (4 salas)
npm run seed

# Rodar o backend
npm run dev
# Acessivel em http://localhost:3000
```

---

### 2. Verificar requisitos AWS

```bash
# Confirmar que a AWS CLI esta configurada
aws sts get-caller-identity
```

No Console AWS, verificar:
- [ ] Conta com menos de 12 meses (Free Tier)
- [ ] Usuario IAM com permissoes:
  - `AmazonEC2FullAccess`
  - `AmazonRDSFullAccess`

---

### 3. Fazer commit e push do codigo

```bash
git status
git add .
git commit -m "migracao: SQLite para PostgreSQL + Prisma + RDS"
git push origin main
```

---

### 4. Limpar infra antiga (apenas na primeira migracao)

Se ja existia uma EC2 rodando com o codigo antigo, limpar pelo Console AWS:

1. **EC2 > Instances** > selecionar `smartbib-backend` > **Terminate**
2. **EC2 > Elastic IPs** > selecionar o IP > **Release**
3. **EC2 > Key Pairs** > deletar `smartbib-key`
4. **VPC > Your VPCs** > selecionar `smartbib-vpc` > **Delete**

> Nota: Isso so precisa ser feito UMA vez na migracao. Depois use sempre `terraform apply`.

---

### 5. Subir infra com Terraform

```bash
cd infra/

# Inicializar (primeira vez)
terraform init

# Aplicar (substitua a senha)
terraform apply -var="db_password=UmaSenhaForte123"
```

O Terraform vai criar:
- VPC, subnets, internet gateway
- EC2 t3.micro (Ubuntu 22.04)
- RDS db.t4g.micro (PostgreSQL 16.4, 20GB)
- Elastic IP
- Security groups (SSH, HTTP, PostgreSQL interno)

**Tempo:** ~7 minutos.

O `user_data.sh` roda automaticamente no primeiro boot:
1. Instala Node.js 20, nginx, git
2. Configura timezone America/Sao_Paulo
3. Clona o repositorio
4. `npm install` + `npx prisma generate` + `npm run build`
5. Cria `.env` com DATABASE_URL do RDS
6. `npx prisma migrate deploy` (cria tabelas)
7. `npm run seed` (popula 4 salas)
8. Cria systemd service e inicia

---

### 6. Verificar deploy

```bash
# Pegar o IP
terraform output public_ip

# Testar
curl http://IP_PUBLICO/api/health
# Esperado: {"status":"ok","timestamp":"..."}
```

---

## Troubleshooting

### Erro: "schema.prisma file not found" no cloud-init

O codigo novo nao estava no GitHub. Fazer commit e push do main.

### Erro: "InvalidKeyPair.Duplicate"

Deletar `smartbib-key` no Console AWS > EC2 > Key Pairs.

### Erro: "AccessDenied: rds:CreateDBSubnetGroup"

Adicionar policy `AmazonRDSFullAccess` ao usuario/grupo IAM.

### Erro: "No migration found" no prisma migrate deploy

A pasta `prisma/migrations/` nao foi commitada. Garantir que esta no Git.

### Erro: "Environment variable not found: DATABASE_URL" no seed

O `seed.ts` precisa de `import "dotenv/config"` no topo para carregar o `.env`.

### Backend nao responde (nginx 404)

```bash
# Na EC2
sudo systemctl restart nginx
sudo systemctl status smartbib
```

### Git "detected dubious ownership"

```bash
git config --global --add safe.directory /opt/smartbib
sudo chown -R ubuntu:ubuntu /opt/smartbib
git pull origin main
```

### Acessar a EC2 via SSH

```bash
ssh -i smartbib-key.pem ubuntu@IP_PUBLICO
```

### Ver logs do backend na EC2

```bash
sudo journalctl -u smartbib -n 50 -f
```

### Ver logs do cloud-init (user_data)

```bash
sudo tail -f /var/log/cloud-init-output.log
```

### Destruir tudo (evitar cobrancas)

```bash
cd infra/
terraform destroy -var="db_password=qualquer"
```

---

## Endpoints da API

| Metodo | Rota | Autenticacao | Descricao |
|---|---|---|---|
| POST | `/api/auth/register` | Nao | Registrar usuario |
| POST | `/api/auth/login` | Nao | Login |
| GET | `/api/salas` | Sim | Listar salas |
| GET | `/api/salas/:id/slots` | Sim | Ver slots disponiveis |
| POST | `/api/reservas` | Sim | Criar reserva |
| GET | `/api/reservas` | Sim | Listar reservas |
| DELETE | `/api/reservas/:id` | Sim | Cancelar reserva |
| POST | `/api/reservas/:id/ocupar` | Sim | Confirmar/ocupar sala |
| DELETE | `/api/reservas/:id/permanent` | Sim | Excluir permanentemente |
| DELETE | `/api/reservas/historico/limpar` | Sim | Limpar historico |
| GET | `/api/health` | Nao | Health check |

---

## Comandos Uteis do Prisma

```bash
npx prisma generate          # Regenerar cliente
npx prisma migrate dev       # Criar nova migration (dev)
npx prisma migrate deploy    # Aplicar migrations (prod)
npx prisma studio            # Interface visual do banco
npx prisma db push           # Sincronizar schema sem migration
npm run seed                 # Popular dados iniciais
```
