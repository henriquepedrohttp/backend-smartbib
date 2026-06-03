# Plano: Agendamento MQTT por Polling

## Objetivo

Enviar comandos MQTT (`ocupar`/`liberar`) apenas no horário efetivo da reserva, em vez de imediatamente na criação.

## Problema Atual

1. Ao criar uma reserva, `publishCommand(salaId, "ocupar")` é enviado **imediatamente** — mesmo que a reserva seja para daqui a 3 horas
2. `salas.status` muda para `"reservada"` imediatamente, bloqueando todos os horários
3. O timer de auto-cancelamento conta a partir da **criação** da reserva, não do `hora_inicio`

## Novo Fluxo (com Polling)

1. Criar reserva → **nenhum comando MQTT**, sala continua `"livre"`
2. Quando `hora_inicio` chega (detectado por polling) → MQTT `"ocupar"`, `salas.status = "reservada"`
3. Quando `hora_fim` chega (detectado por polling) → MQTT `"liberar"`, `salas.status = "livre"` (se sem outras reservas ativas)
4. Auto-cancel de 10 min conta a partir de `hora_inicio` (não da criação)

## Arquivos a Modificar/Criar

### 1. `src/database.ts` — Adicionar colunas na tabela `reservas`

```sql
mqtt_inicio_enviado INTEGER DEFAULT 0  -- 0 = não enviado, 1 = enviado
mqtt_fim_enviado    INTEGER DEFAULT 0  -- 0 = não enviado, 1 = enviado
```

Essas colunas controlam se o comando MQTT de início/fim já foi processado pelo polling, impedindo reenvios duplicados no próximo ciclo.

### 2. `src/services/mqttScheduler.ts` — Novo módulo (scheduler por polling)

Rodando a cada **60 segundos**, executa 3 verificações **em ordem**:

#### a) Enviar "ocupar" — Reservas que começaram mas MQTT não foi enviado

```sql
SELECT id, sala_id FROM reservas
WHERE status != 'cancelada' AND mqtt_inicio_enviado = 0
  AND (data || ' ' || hora_inicio) <= datetime('now', 'localtime')
```

- `publishCommand(salaId, "ocupar")`
- `mqtt_inicio_enviado = 1`
- `salas.status = 'reservada'`

#### b) Auto-cancelar — Reservas "pendente" há mais de 10 min após `hora_inicio`

```sql
SELECT id, sala_id FROM reservas
WHERE status = 'pendente' AND mqtt_inicio_enviado = 1
  AND datetime(data || ' ' || hora_inicio, '+10 minutes') <= datetime('now', 'localtime')
```

- `status = 'cancelada'`
- `mqtt_fim_enviado = 1`
- `publishCommand(salaId, "liberar")`
- `salas.status = 'livre'` (se sem outras reservas ativas para a sala)

#### c) Enviar "liberar" — Reservas que terminaram mas MQTT não foi enviado

```sql
SELECT id, sala_id FROM reservas
WHERE status != 'cancelada' AND mqtt_fim_enviado = 0
  AND (data || ' ' || hora_fim) <= datetime('now', 'localtime')
```

- `publishCommand(salaId, "liberar")`
- `mqtt_fim_enviado = 1`
- `salas.status = 'livre'` (se sem outras reservas ativas para a sala)

**Ordem de execução: a → b → c**

A ordem importa: se um "ocupar" e um auto-cancel se sobrepõem no mesmo ciclo, o "ocupar" é enviado primeiro, depois o cancelamento envia "liberar".

### 3. `src/routes/reservas.ts` — Ajustar criação e cancelamento

#### Criação (`POST /`)

- **Remover** `publishCommand(salaId, "ocupar")`
- **Remover** `scheduleAutoCancel(reservaId, salaId, 10)`
- **Remover** `db.run("UPDATE salas SET status = 'reservada' WHERE id = ?", [salaId])`
- A reserva é criada apenas como `status = 'pendente'`, sem efeitos colaterais imediatos

#### Cancelamento (`DELETE /:id`)

- Se `mqtt_inicio_enviado = 1` → enviar `"liberar"` (reserva já estava ativa no ESP32)
- Setar `mqtt_fim_enviado = 1` (evitar que o polling tente liberar de novo)
- Se `mqtt_inicio_enviado = 0` → nenhum comando MQTT (reserva ainda não tinha começado)

#### Confirmação (`POST /:id/ocupar`)

- Muda `status = 'confirmada'`, `salas.status = 'ocupada'`
- Mantém `publishCommand(salaId, "ocupar")` — idempotente, sem problema enviar de novo

### 4. `src/services/scheduler.ts` — Remover

Arquivo inteiro removido. A lógica de auto-cancelamento por timer é substituída pelo check (b) no `mqttScheduler.ts`.

### 5. `src/index.ts` — Iniciar o polling no startup

```typescript
import { startMqttScheduler } from "./services/mqttScheduler";

// Após initDb e connectMQTT:
startMqttScheduler();
```

O primeiro ciclo executa **imediatamente** (sem esperar 60s), processando qualquer comando que teria sido perdido durante downtime do servidor.

## Resumo das Mudanças

| Arquivo | Ação |
|---------|------|
| `src/database.ts` | Adicionar 2 colunas na tabela `reservas` |
| `src/services/mqttScheduler.ts` | Criar novo — polling a cada 60s com 3 checks |
| `src/services/scheduler.ts` | Remover (lógica movida para mqttScheduler) |
| `src/routes/reservas.ts` | Remover MQTT/ação imediata na criação; ajustar cancelamento |
| `src/index.ts` | Importar e iniciar `startMqttScheduler()` |