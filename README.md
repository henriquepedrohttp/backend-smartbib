# SmartBib - Backend

API REST + bridge MQTT para o sistema de reservas de salas da biblioteca SENAC.

## Pré-requisitos

- **Node.js** 18+
- **npm** 9+

## Instalação

```bash
cd backend
npm install
```

## Configuração

Copie o arquivo de exemplo e ajuste os valores:

```bash
cp .env.example .env
```

Variáveis disponíveis:

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta do servidor Express | `3000` |
| `JWT_SECRET` | Chave secreta para tokens JWT | `smartbib-secret-key-2025` |

## Rodando

### Desenvolvimento (com hot-reload via ts-node)

```bash
npm run dev
```

### Produção (compilado)

```bash
npm run build
npm start
```

O servidor inicia em `http://localhost:3000`.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Registrar usuário |
| POST | `/api/auth/login` | Login (retorna JWT) |
| GET | `/api/salas` | Listar salas |
| GET | `/api/salas/:id/slots?data=YYYY-MM-DD` | Horários disponíveis de uma sala |
| POST | `/api/reservas` | Criar reserva |
| GET | `/api/reservas` | Listar reservas do usuário |
| DELETE | `/api/reservas/:id` | Cancelar reserva |
| POST | `/api/reservas/:id/ocupar` | Confirmar ocupação da sala |
| GET | `/api/health` | Health check |

## Arquitetura

- **Express** — Servidor HTTP
- **sql.js** (SQLite in-memory) — Banco de dados persistido em `smartbib.db`
- **MQTT** — Comunicação com ESP32 via broker HiveMQ público
- **Scheduler** — Polling a cada 60s que gerencia comandos MQTT e auto-cancelamento

### Fluxo do Scheduler

A cada 60 segundos, o scheduler executa 3 verificações em ordem:

1. **`processOcupar`** — Encontra reservas onde `hora_inicio <= agora` e envia comando `"reservar"` (LED âmbar) ao ESP32
2. **`processAutoCancel`** — Cancela reservas pendentes que não foram confirmadas em 10 minutos após o horário de início
3. **`processLiberar`** — Encontra reservas onde `hora_fim <= agora` e envia comando `"liberar"` (LED verde) ao ESP32