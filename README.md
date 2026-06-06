# SmartBib - Backend

API REST + bridge MQTT para o sistema de reservas de salas da biblioteca SENAC. Gerencia autenticacao, salas, reservas e sincroniza o estado com dispositivos ESP32 via MQTT.

## Pre-requisitos

- **Node.js** 18+
- **npm** 9+

## Instalacao

```bash
cd backend-smartbib
npm install
```

## Configuracao

Copie o arquivo de exemplo e ajuste os valores:

```bash
cp .env.example .env
```

Variaveis disponiveis:

| Variavel | Descricao | Padrao |
|---|---|---|
| `PORT` | Porta do servidor Express | `3000` |
| `JWT_SECRET` | Chave secreta para tokens JWT | `smartbib-secret-key-2025` |

## Rodando

### Desenvolvimento (com hot-reload via ts-node)

```bash
npm run dev
```

### Producao (compilado)

```bash
npm run build
npm start
```

O servidor inicia em `http://localhost:3000`.

## Endpoints

### Autenticacao

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| POST | `/api/auth/register` | Nao | Registrar usuario (`email`, `matricula`, `senha`) |
| POST | `/api/auth/login` | Nao | Login (`email`, `senha`), retorna JWT |

### Salas

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| GET | `/api/salas` | Sim | Listar salas com status (fundido com cache MQTT) |
| GET | `/api/salas/:id/slots?data=YYYY-MM-DD` | Sim | Horarios disponiveis de uma sala |

Os slots sao fixos de 08:00 as 22:00 com intervalo de almoco (12:00-13:00). Um slot aparece como indisponivel se houver reserva que conflite com o horario.

### Reservas

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| POST | `/api/reservas` | Sim | Criar reserva (`salaId`, `data`, `horaInicio`, `horaFim`) |
| GET | `/api/reservas` | Sim | Listar reservas do usuario |
| DELETE | `/api/reservas/:id` | Sim | Cancelar reserva (soft delete, status = `cancelada`) |
| POST | `/api/reservas/:id/ocupar` | Sim | Confirmar ocupacao da sala (so durante o horario) |
| DELETE | `/api/reservas/:id/permanent` | Sim | Excluir permanentemente do historico |
| DELETE | `/api/reservas/historico/limpar` | Sim | Limpar todo o historico do usuario |

### Health

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| GET | `/api/health` | Nao | Health check |

## Arquitetura

```
Mobile App (Expo) ──► Express :3000
                           │
                           ├── sql.js (SQLite, WAL mode) ── smartbib.db
                           │
                           ├── MQTT Client (mqtt.js)
                           │     Pub:  senac/biblioteca/sala{id}/comando
                           │     Sub:  senac/biblioteca/+/status
                           │
                           └── Scheduler (setInterval 60s)
                                 processOcupar → processAutoCancel → processLiberar
```

### Banco de Dados (SQLite)

- **sql.js** -- SQLite compilado para JavaScript, persistido em disco com WAL mode
- **users** -- `id`, `email` (UNIQUE), `matricula`, `senha_hash` (bcrypt), `created_at`
- **salas** -- `id`, `nome`, `capacidade`, `andar`, `recursos` (JSON), `icon`, `status` (livre/reservada/ocupada)
- **reservas** -- `id`, `user_id` (FK), `sala_id` (FK), `data`, `hora_inicio`, `hora_fim`, `status` (pendente/confirmada/cancelada), `mqtt_inicio_enviado`, `mqtt_fim_enviado`, `mqtt_inicio_enviado_at`, `created_at`

4 salas sao inseridas como seed na primeira execucao.

### Autenticacao

JWT (HMAC-SHA256) com middleware em todas as rotas `/api/salas` e `/api/reservas`. Token expira em 1h no registro, 7 dias no login.

### MQTT

Conexao com broker publico HiveMQ (`broker.hivemq.com:1883`).

| Topico | Direcao | Payload |
|---|---|---|
| `senac/biblioteca/+/status` | Subscreve (ESP -> backend) | `"livre"`, `"reservada"`, `"ocupada"` |
| `senac/biblioteca/sala{id}/comando` | Publica (backend -> ESP) | `"reservar"`, `"ocupar"`, `"liberar"` |

Ao receber um status do ESP32, o backend atualiza tanto o cache em memoria (`roomStatusCache`) quanto o banco de dados. O endpoint `GET /api/salas` funde o cache MQTT com o status do banco, priorizando o cache quando diferente de `"livre"`.

Os comandos MQTT so sao publicados se o cliente estiver conectado. Caso contrario, o scheduler tentara novamente no proximo ciclo.

### Scheduler (Polling a cada 60s)

O scheduler executa 3 etapas em ordem a cada 60 segundos:

1. **`processOcupar`** -- Encontra reservas onde `hora_inicio <= agora` e `mqtt_inicio_enviado = 0`. Publica comando `"reservar"` ao ESP32 e altera status da sala para `"reservada"`.

2. **`processAutoCancel`** -- Cancela reservas com status `"pendente"` que estao ha 5 minutos alem do `hora_inicio` sem confirmacao. Publica `"liberar"` ao ESP32 e volta status da sala para `"livre"`.

3. **`processLiberar`** -- Encontra reservas onde `hora_fim <= agora` e `mqtt_fim_enviado = 0`. Publica `"liberar"` ao ESP32 e volta status da sala para `"livre"`.

### Infraestrutura (AWS via Terraform)

O diretorio `infra/` contem a definicao completa de infraestrutura como codigo:

- **EC2 t3.micro** com Ubuntu 22.04
- **nginx** como reverse proxy (porta 80 -> localhost:3000)
- **VPC** com subnet publica e security group (SSH + HTTP)
- Bootstrap automatico via `user_data.sh` (Node 20, clone do repo, build, systemd)

```bash
cd infra
terraform apply
```
