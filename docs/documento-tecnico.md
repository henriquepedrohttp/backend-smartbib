# Documento Tecnico -- SmartBib

## 1. Descricao da Solucao e Problema Resolvido

### Problema

Em ambientes academicos e corporativos, a gestao de salas de reuniao e estudo frequentemente sofre com conflitos de horario, ocupacoes nao registradas e falta de visibilidade em tempo real sobre o status das salas. Os usuarios precisam se deslocar fisicamente ate a sala para saber se ela esta disponivel, e o controle manual de reservas gera retrabalho e subutilizacao dos espacos.

### Solucao

O **SmartBib** e um sistema de reserva de salas composto por:

- **Aplicativo mobile** (React Native) -- interface para o usuario visualizar salas, horarios disponiveis e realizar reservas
- **Backend** (Node.js + Express + TypeScript) -- API REST responsavel pela logica de negocio, autenticacao, gestao de reservas e comunicacao com dispositivos IoT
- **Dispositivos ESP32** instalados nas salas -- recebem comandos MQTT para exibir o status da sala (livre/reservada/ocupada)

O fluxo principal:
1. O usuario faz login no app mobile
2. Visualiza as salas e os horarios disponiveis para uma data
3. Realiza uma reserva (status: pendente)
4. No horario de inicio, o backend envia automaticamente o comando "reservar" via MQTT para o ESP32 da sala
5. O usuario chega na sala e confirma a ocupacao pelo app (status: confirmada / "ocupar")
6. Se o usuario nao confirmar em ate 5 minutos, a reserva e cancelada automaticamente (auto-cancel)
7. Ao fim do horario reservado, o backend envia "liberar" via MQTT

O backend realiza **polling a cada 60 segundos** para gerenciar as transicoes de estado das reservas, eliminando a necessidade de o usuario lembrar de liberar a sala manualmente.


## 2. Lista de Servicos AWS Utilizados com Justificativa

### 2.1 Amazon EC2 (Elastic Compute Cloud)

| Atributo | Valor |
|---|---|
| Tipo de instancia | t3.micro (2 vCPU, 1 GB RAM) |
| Sistema operacional | Ubuntu 22.04 LTS |
| Armazenamento | 20 GB gp3 |
| Regiao | us-east-1 |

**Justificativa:** O EC2 foi escolhido em vez de AWS App Runner ou ECS pela necessidade de executar um processo de **polling continuo (setInterval)** para o scheduler MQTT, que exige um processo sempre ativo. A instancia t3.micro atende aos requisitos de CPU/RAM para uma API REST de baixo volume, com custo elegivel ao free tier. O Ubuntu 22.04 LTS oferece estabilidade e suporte de longo prazo.

### 2.2 Amazon RDS (Relational Database Service)

| Atributo | Valor |
|---|---|
| Engine | PostgreSQL 16.4 |
| Tipo de instancia | db.t4g.micro (ARM, 2 vCPU, 1 GB RAM) |
| Armazenamento | 20 GB gp2 |
| Multi-AZ | Nao (single-AZ) |
| Acesso publico | Desabilitado |

**Justificativa:** O RDS PostgreSQL foi escolhido por:
1. **Gerenciamento automatizado** -- backups, patches e manutencao sao gerenciados pela AWS
2. **Integracao com Prisma ORM** -- o Prisma oferece suporte nativo a PostgreSQL com migrations versionadas
3. **Seguranca** -- o banco nao e publicamente acessivel; apenas o security group do EC2 tem acesso a porta 5432
4. **Migracao do SQLite** -- o projeto foi migrado de SQLite para PostgreSQL justamente para viabilizar o deploy em producao com RDS, ja que SQLite nao e adequado para ambientes multi-instancia

### 2.3 Amazon VPC (Virtual Private Cloud)

| Atributo | Valor |
|---|---|
| Bloco CIDR | 10.0.0.0/16 |
| Subnets publicas | 2 (10.0.1.0/24 e 10.0.2.0/24 em AZs diferentes) |
| Internet Gateway | Sim |
| Route table | 0.0.0.0/0 -> IGW |

**Justificativa:** A VPC isola logicamente todos os recursos do projeto. Duas subnets em Availability Zones diferentes garantem que o RDS possa ser expandido para Multi-AZ no futuro. O Internet Gateway permite que o EC2 acesse a internet (necessario para clonar o repositorio, instalar pacotes npm e conectar ao broker MQTT publico).

### 2.4 Security Groups

| SG | Ingress | Egress |
|---|---|---|
| smartbib-sg (EC2) | SSH:22 (0.0.0.0/0), HTTP:80 (0.0.0.0/0) | All traffic (0.0.0.0/0) |
| smartbib-rds-sg (RDS) | PostgreSQL:5432 (apenas smartbib-sg) | All traffic (0.0.0.0/0) |

**Justificativa:** O principio do menor privilegio e aplicado: o RDS so aceita conexoes do security group do EC2. O EC2 expoe apenas SSH para administracao e HTTP para o nginx. O egress aberto e necessario para comunicacao com o broker MQTT externo (broker.hivemq.com:1883) e para instalacao de dependencias.

### 2.5 Elastic IP

**Justificativa:** O IP elastico garante um endereco publico fixo para a instancia EC2. Isso e essencial para que o app mobile acesse a API em um endereco estavel, mesmo que a instancia seja parada e reiniciada. Sem o Elastic IP, o IP publico mudaria a cada parada.

### 2.6 Infraestrutura como Codigo -- Terraform

**Justificativa:** Todo o provisionamento da infraestrutura AWS e definido em codigo Terraform (`infra/*.tf`), garantindo:
- **Reprodutibilidade** -- o ambiente pode ser recriado em minutos com `terraform apply`
- **Versionamento** -- a infraestrutura evolui junto com o codigo no Git
- **Documentacao viva** -- os arquivos `.tf` servem como documentacao executavel da arquitetura

### 2.7 Servicos Externos (nao-AWS)

| Servico | Funcao |
|---|---|
| HiveMQ (broker publico) | Broker MQTT gratuito para comunicacao com ESP32 |
| GitHub | Hospedagem do codigo-fonte |


## 3. Diagrama de Arquitetura

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                           USUARIO                                   │
  │  ┌──────────────────────┐                                           │
  │  │  App Mobile           │                                          │
  │  │  (React Native/Expo) │                                          │
  │  └──────────┬───────────┘                                           │
  │             │ HTTPS (porta 80/443)                                  │
  └─────────────┼───────────────────────────────────────────────────────┘
                │
  ┌─────────────┼───────────────────────────────────────────────────────┐
  │    AWS CLOUD │                       VPC 10.0.0.0/16                │
  │  ┌───────────┴──────────────────────────────────────────────────┐   │
  │  │  Elastic IP (IP fixo)                                         │   │
  │  └───────────┬──────────────────────────────────────────────────┘   │
  │              │                                                       │
  │  ┌───────────┴──────────────────────────────────────────────────┐   │
  │  │  Internet Gateway                                             │   │
  │  └───────────┬──────────────────────────────────────────────────┘   │
  │              │                                                       │
  │  ┌───────────┴──────────┐  ┌────────────────────────────────────┐   │
  │  │  Public Subnet        │  │  Public Subnet AZ2                 │   │
  │  │  10.0.1.0/24          │  │  10.0.2.0/24                      │   │
  │  │                       │  │                                    │   │
  │  │  ┌─────────────────┐  │  │                                    │   │
  │  │  │ EC2 t3.micro    │  │  │                                    │   │
  │  │  │ Ubuntu 22.04    │  │  │                                    │   │
  │  │  │                 │  │  │                                    │   │
  │  │  │ ┌─────────────┐ │  │  │                                    │   │
  │  │  │ │ nginx :80   │ │  │  │                                    │   │
  │  │  │ │ reverse proxy│ │  │  │                                    │   │
  │  │  │ └──────┬──────┘ │  │  │                                    │   │
  │  │  │        │        │  │  │                                    │   │
  │  │  │ ┌──────┴──────┐ │  │  │                                    │   │
  │  │  │ │ Express     │ │  │  │                                    │   │
  │  │  │ │ API :3000   │ │  │  │                                    │   │
  │  │  │ │             │ │  │  │                                    │   │
  │  │  │ │ ┌─────────┐ │ │  │  │  ┌──────────────────────────────┐ │   │
  │  │  │ │ │Prisma   │ │ │  │  │  │ RDS PostgreSQL 16.4          │ │   │
  │  │  │ │ │ORM      │─┼─┼──┼──┼── db.t4g.micro :5432           │ │   │
  │  │  │ │ └─────────┘ │ │  │  │  │ (acesso interno via SG)       │ │   │
  │  │  │ │             │ │  │  │  └──────────────────────────────┘ │   │
  │  │  │ │ ┌─────────┐ │ │  │  │                                    │   │
  │  │  │ │ │Scheduler│ │ │  │  │                                    │   │
  │  │  │ │ │60s poll │ │ │  │  │                                    │   │
  │  │  │ │ └─────────┘ │ │  │  │                                    │   │
  │  │  │ │             │ │  │  │                                    │   │
  │  │  │ │ ┌─────────┐ │ │  │  │                                    │   │
  │  │  │ │ │MQTT     │ │ │  │  │                                    │   │
  │  │  │ │ │Client   │─┼─┼──┼──┼───> broker.hivemq.com:1883        │   │
  │  │  │ │ └─────────┘ │ │  │  │         (fora da VPC)              │   │
  │  │  │ └────────────┘ │  │  │                                    │   │
  │  │  └─────────────────┘  │  │                                    │   │
  │  │                       │  │                                    │   │
  │  │  SG: SSH:22 + HTTP:80│  │                                    │   │
  │  └───────────────────────┘  └────────────────────────────────────┘   │
  │                                                                       │
  └───────────────────────────────────────────────────────────────────────┘
```

### Fluxo de dados

1. App mobile -> HTTP POST/GET -> Elastic IP -> nginx (proxy reverso) -> Express API :3000
2. Express -> Prisma ORM -> RDS PostgreSQL (leitura/escrita de usuarios, salas, reservas)
3. Scheduler (60s) -> consulta reservas no RDS -> publica comandos MQTT -> HiveMQ -> ESP32
4. ESP32 -> publica status MQTT -> HiveMQ -> MQTT Client (subscribe) -> atualiza cache + banco

### Diagrama draw.io

Para montar no draw.io, siga a estrutura acima. Os componentes principais sao:

- **Elastic IP** -> aponta para a instancia EC2
- **EC2 t3.micro** contendo 4 modulos internos: nginx, Express API, Scheduler e MQTT Client
- **RDS PostgreSQL** conectado exclusivamente ao EC2 via Security Group
- **HiveMQ** (externo a AWS) recebendo publicacoes do MQTT Client e enviando status do ESP32
- **ESP32** (fora da AWS) assinando topicos de comando e publicando topicos de status
- **App Mobile** acessando a API via HTTP


## 4. Licoes Aprendidas

### 4.1 Migracao de SQLite para PostgreSQL

O projeto originalmente utilizava SQLite com `sql.js` (banco em memoria/arquivo). A migracao para PostgreSQL + Prisma foi necessaria para o deploy em producao.

- **Desafio:** adaptar queries que usavam funcoes especificas do SQLite e lidar com o schema versionado do Prisma.
- **Solucao:** uso de migrations do Prisma (`prisma migrate dev` e `prisma migrate deploy`) e criacao do seed para dados iniciais.

### 4.2 Scheduler de Polling vs. Eventos em Tempo Real

O primeiro design previa que o backend reagisse apenas a eventos (usuario reserva -> envia MQTT imediatamente). Porem, o requisito de **auto-cancel apos 5 minutos sem confirmacao** e **liberacao automatica ao fim do horario** exigia um mecanismo de polling.

- **Desafio:** garantir que o polling de 60 segundos nao perdesse eventos e que a ordem de processamento (ocupar -> auto-cancel -> liberar) fosse correta.
- **Solucao:** executar as tres fases sequencialmente dentro do mesmo tick. A ordem importa -- processar ocupar antes de auto-cancel evita que uma reserva recem-iniciada seja cancelada antes de enviar o comando "reservar".

### 4.3 MQTT e Estado de Conexao

O broker HiveMQ publico e gratuito mas nao garante 100% de disponibilidade.

- **Desafio:** quando o MQTT esta offline, o scheduler tentava atualizar o banco mas o comando nunca chegava ao ESP32, deixando o banco e o dispositivo dessincronizados.
- **Solucao:** o scheduler verifica `isMqttConnected()` antes de atualizar o banco. Se estiver offline, registra um warning e reprocessa no proximo ciclo. O retry com backoff exponencial (ate 10 tentativas) garante resiliencia.

### 4.4 Bootstrap Automatizado com user_data

O script `user_data.sh` automatiza toda a configuracao do EC2: instala Node.js, nginx, clona o repositorio, instala dependencias, roda migrations e cria o servico systemd.

- **Desafio:** o script precisa esperar o RDS estar disponivel antes de rodar as migrations. Sem isso, o `prisma migrate deploy` falha.
- **Solucao:** inserido um `sleep 30` e o Prisma tem retry interno. Uma melhoria futura seria implementar um health check mais robusto com loop de tentativas.

### 4.5 Terraform e Variaveis Sensiveis

O JWT secret e a senha do banco sao gerados dinamicamente pelo Terraform (`random_password`) e injetados no EC2 via `templatefile`.

- **Desafio:** evitar expor essas variaveis no codigo ou no state do Terraform.
- **Solucao:** o `.env` nunca e commitado (esta no `.gitignore`), e o state do Terraform deve ser armazenado em backend remoto (S3 + DynamoDB) em producao.

### 4.6 Corretude do Scheduler com Timestamps

O scheduler compara datas e horarios (`horaInicio`, `horaFim`) para decidir quando ocupar, cancelar ou liberar.

- **Desafio:** o fuso horario do servidor precisava ser consistente com os horarios das reservas.
- **Solucao:** o `user_data.sh` configura o timezone para `America/Sao_Paulo` via `timedatectl set-timezone America/Sao_Paulo`.


## 5. Prints do Portal AWS (Sugestoes)

Capture os seguintes prints no console AWS para incluir no documento:

1. **EC2 Dashboard** -- listando a instancia `smartbib-backend` rodando (Status: Running)
2. **EC2 Instance details** -- mostrando tipo t3.micro, subnet, security group, Elastic IP associado
3. **RDS Dashboard** -- listando a instancia `smartbib-db` (Status: Available)
4. **RDS Configuration** -- mostrando engine PostgreSQL 16.4, db.t4g.micro, endpoint
5. **VPC Dashboard** -- mostrando a VPC `smartbib-vpc` com as 2 subnets e o Internet Gateway
6. **Security Groups** -- mostrando as regras de inbound do `smartbib-sg` (SSH + HTTP) e `smartbib-rds-sg` (PostgreSQL do SG do EC2)
7. **Elastic IP** -- mostrando o IP alocado e associado a instancia EC2
8. **Prova de funcionamento** -- resposta do endpoint `GET /api/health` no navegador/Postman: `{"status":"ok","timestamp":"..."}`
9. **Prova do banco** -- screenshot de uma query mostrando dados nas tabelas `users`, `salas`, `reservas`
