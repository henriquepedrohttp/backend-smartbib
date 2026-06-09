# Guia de Migracao: SQLite -> PostgreSQL + Prisma

## Pre-requisitos

- [Docker](https://docs.docker.com/get-docker/) e Docker Compose instalados
- [Node.js](https://nodejs.org/) 18+ instalado
- [Conta AWS](https://aws.amazon.com/) com free tier ativo (menos de 12 meses)
- [Terraform](https://developer.hashicorp.com/terraform/downloads) 1.0+ instalado
- [AWS CLI](https://aws.amazon.com/cli/) configurado (`aws configure`)

---

## Sumario do Projeto

```
backend/
  docker-compose.yml          # PostgreSQL local (dev)
  prisma/
    schema.prisma             # Models: User, Sala, Reserva
    seed.ts                   # Popula 4 salas iniciais
  src/
    index.ts                  # Entry point
    lib/prisma.ts             # Singleton PrismaClient
    routes/
      auth.ts                 # POST /register, /login
      salas.ts                # GET / (listar salas), GET /:id/slots
      reservas.ts             # CRUD reservas
    middleware/auth.ts        # JWT middleware
    services/
      mqtt.ts                 # Conexao HiveMQ + cache status
      mqttScheduler.ts        # Polling 60s (ocupar/cancelar/liberar)
  infra/                      # Terraform (AWS)
    main.tf, vpc.tf, ec2.tf, rds.tf,
    security.tf, eip.tf, outputs.tf,
    variables.tf, user_data.sh, nginx.conf
```

---

## Parte 1: Ambiente de Desenvolvimento Local

### 1.1 Subir o PostgreSQL com Docker

```bash
cd backend/

# Subir o container PostgreSQL (porta 5432)
docker compose up -d

# Verificar se esta rodando
docker compose ps
# Deve mostrar: backend-db-1   Up   ...   0.0.0.0:5432->5432/tcp
```

### 1.2 Instalar dependencias

```bash
npm install
```

### 1.3 Criar arquivo .env

```bash
cp .env.example .env
```

O arquivo `.env` ja vem com o `DATABASE_URL` apontando para o Docker:

```
PORT=3000
JWT_SECRET=smartbib-secret-key-2025
DATABASE_URL=postgresql://smartbib:smartbib123@localhost:5432/smartbib
```

> **Nota:** O `.env` NAO vai para o git (esta no `.gitignore`).

### 1.4 Criar as tabelas no banco (migration)

```bash
npx prisma migrate dev --name init
```

Isso vai:
- Aplicar o schema do `prisma/schema.prisma`
- Criar as tabelas `users`, `salas`, `reservas` no PostgreSQL
- Gerar o cliente Prisma atualizado

### 1.5 Popular dados iniciais (seed)

```bash
npm run seed
```

Vai inserir as 4 salas: Sala 1, Sala 2, Sala 3, Sala 4.

### 1.6 Rodar o backend

```bash
npm run dev
```

Voce deve ver no terminal:

```
[Backend] Conectando ao banco de dados...
[Backend] Banco de dados conectado
[Backend] Conectando ao MQTT...
[Backend] MQTT inicializado (conexao pode estar pendente)
[Backend] Iniciando agendador MQTT...
[Backend] Servidor rodando em http://localhost:3000
```

### 1.7 Testar os endpoints

```bash
# Health check
curl http://localhost:3000/api/health

# Registrar usuario
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@email.com","matricula":"12345","senha":"senha123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@email.com","senha":"senha123"}'

# Listar salas (use o token do login)
curl http://localhost:3000/api/salas \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

### 1.8 Parar o PostgreSQL quando terminar

```bash
docker compose down
# Para manter os dados: docker compose stop
```

---

## Parte 2: Deploy na AWS (Producao)

### 2.1 Verificar credenciais AWS

```bash
aws sts get-caller-identity
```

Deve mostrar seu `UserId`, `Account` e `Arn`. Se falhar, rode `aws configure`.

### 2.2 Verificar elegibilidade do Free Tier

No console AWS: **Billing > Free Tier**

Confirme que:
- Sua conta tem menos de 12 meses
- Voce nao ultrapassou os limites de RDS (750h/mes, 20GB storage)

### 2.3 Configurar permissoes IAM

O usuario IAM usado pelo Terraform precisa das policies:

- `AmazonEC2FullAccess`
- `AmazonRDSFullAccess`
- `AmazonVPCFullAccess`
- `IAMFullAccess` (ou `IAMReadOnlyAccess` + permissao para criar key pairs)

> Se o usuario tiver `AdministratorAccess`, ja cobre tudo.

### 2.4 Aplicar o Terraform

```bash
cd infra/

# Inicializar (primeira vez ou apos limpar .terraform/)
terraform init

# Ver o que vai ser criado
terraform plan -var="db_password=UmaSenhaForte123"

# Aplicar
terraform apply -var="db_password=UmaSenhaForte123"
```

O Terraform vai criar:

| Recurso | Descricao |
|---|---|
| VPC + 2 subnets publicas | Rede isolada (10.0.0.0/16) |
| Security Groups | EC2 (SSH+HTTP) e RDS (PostgreSQL interno) |
| EC2 t3.micro | Ubuntu 22.04, 20GB gp3 |
| RDS db.t4g.micro | PostgreSQL 16.4, 20GB, Single-AZ |
| Elastic IP | IP fixo para a EC2 |

**Tempo estimado:** 5-8 minutos.

### 2.5 O que o user_data.sh faz automaticamente

Quando a EC2 iniciar pela primeira vez, o script `user_data.sh`:

1. Instala Node.js 20, nginx, git
2. Configura timezone para America/Sao_Paulo
3. Clona o repositorio GitHub
4. Roda `npm install` e `npm run build`
5. Gera o `.env` com a `DATABASE_URL` do RDS
6. Roda `npx prisma migrate deploy` (cria tabelas)
7. Roda `npm run seed` (popula salas)
8. Inicia o backend via systemd na porta 3000
9. Configura nginx como proxy reverso (porta 80 -> 3000)

### 2.6 Acessar a aplicacao

```bash
# Pegar o IP publico
terraform output public_ip

# Testar
curl http://IP_PUBLICO/api/health
```

### 2.7 Acessar a EC2 via SSH

```bash
ssh -i smartbib-key.pem ubuntu@IP_PUBLICO
```

### 2.8 Destruir tudo (para nao pagar)

```bash
terraform destroy -var="db_password=QualquerCoisa"
```

> O Elastic IP e o RDS podem gerar custos se deixar rodando.

---

## Parte 3: Comandos Uteis do Prisma

```bash
# Recriar migration apos alterar o schema
npx prisma migrate dev --name descricao_da_mudanca

# Apenas gerar o cliente (sem migration)
npx prisma generate

# Abrir visualizador do banco (Prisma Studio)
npx prisma studio

# Resetar o banco (apaga TUDO e recria)
npx prisma migrate reset

# Aplicar migrations em producao (sem criar novas)
npx prisma migrate deploy
```

---

## Parte 4: Troubleshooting

### Erro: "Can't reach database server at localhost:5432"

```bash
# PostgreSQL nao subiu. Verifique:
docker compose ps
docker compose logs db
```

### Erro: "Database 'smartbib' does not exist"

O `docker-compose.yml` ja cria o banco via `POSTGRES_DB`. Se precisar recriar:

```bash
docker compose down -v   # -v remove o volume com dados
docker compose up -d      # recria tudo
```

### Erro: "Environment variables not found" no Prisma

Certifique-se de que o `.env` existe na raiz do projeto:

```bash
ls -la .env
cat .env | grep DATABASE_URL
```

### Erro: "AccessDenied" no Terraform

Suas credenciais AWS nao tem as permissoes necessarias. No IAM, adicione as policies mencionadas na secao 2.3.

### Erro: "db.t4g.micro not eligible for free tier"

Troque para `db.t3.micro` no arquivo `infra/rds.tf`:

```hcl
instance_class = "db.t3.micro"
```

### Migration travou / deu conflito

```bash
# Resetar o banco local (dev apenas!)
docker compose down -v
docker compose up -d
npx prisma migrate dev --name init
npm run seed
```

---

## Checklist Final

- [ ] Docker instalado e rodando
- [ ] `docker compose up -d` funcionou
- [ ] `npx prisma migrate dev --name init` criou as tabelas
- [ ] `npm run seed` populou 4 salas
- [ ] `npm run dev` iniciou sem erros
- [ ] Endpoints testados com curl/Postman
- [ ] AWS CLI configurado (`aws sts get-caller-identity`)
- [ ] `terraform apply` concluiu sem erros
- [ ] `curl http://IP_PUBLICO/api/health` retornou `{"status":"ok"}`
