import { getDb, saveDb } from "../database";
import { publishCommand, isMqttConnected } from "./mqtt";

const POLL_INTERVAL_MS = 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

function processOcupar(): void {
  const db = getDb();
  const connected = isMqttConnected();

  const rows = db.exec(
    `SELECT id, sala_id FROM reservas
     WHERE status != 'cancelada' AND mqtt_inicio_enviado = 0
       AND (data || ' ' || hora_inicio) <= datetime('now', 'localtime')`
  );

  if (rows.length === 0 || rows[0].values.length === 0) return;

  const now = new Date().toISOString().replace("T", " ").replace("Z", "");

  for (const row of rows[0].values) {
    const [reservaId, salaId] = row as [number, number];

    publishCommand(salaId, "reservar");

    if (connected) {
      db.run("UPDATE reservas SET mqtt_inicio_enviado = 1, mqtt_inicio_enviado_at = ? WHERE id = ?", [now, reservaId]);
      db.run("UPDATE salas SET status = 'reservada' WHERE id = ?", [salaId]);
      console.log(`[MQTTScheduler] Reserva ${reservaId}: comando "reservar" enviado para sala ${salaId}`);
    } else {
      console.warn(`[MQTTScheduler] Reserva ${reservaId}: MQTT offline, tentará enviar "reservar" no próximo ciclo`);
    }
  }

  saveDb();
}

function processAutoCancel(): void {
  const db = getDb();

  const rows = db.exec(
    `SELECT id, sala_id FROM reservas
     WHERE status = 'pendente'
       AND datetime(data || ' ' || hora_inicio, '+5 minutes') <= datetime('now', 'localtime')
       AND created_at <= (data || ' ' || hora_inicio)`
  );

  if (rows.length === 0 || rows[0].values.length === 0) return;

  for (const row of rows[0].values) {
    const [reservaId, salaId] = row as [number, number];

    db.run("UPDATE reservas SET status = 'cancelada', mqtt_fim_enviado = 1 WHERE id = ?", [reservaId]);

    const outrasAtivas = db.exec(
      "SELECT COUNT(*) as c FROM reservas WHERE sala_id = ? AND status != 'cancelada' AND id != ?",
      [salaId, reservaId]
    );
    const count = outrasAtivas[0].values[0][0] as number;
    if (count === 0) {
      db.run("UPDATE salas SET status = 'livre' WHERE id = ?", [salaId]);
    }

    publishCommand(salaId, "liberar");

    console.log(`[MQTTScheduler] Reserva ${reservaId}: auto-cancelada (não confirmada em 5 minutos após o início)`);
  }

  saveDb();
}

function processLiberar(): void {
  const db = getDb();

  const rows = db.exec(
    `SELECT id, sala_id, status FROM reservas
     WHERE status NOT IN ('cancelada') AND mqtt_fim_enviado = 0
       AND (data || ' ' || hora_fim) <= datetime('now', 'localtime')`
  );

  if (rows.length === 0 || rows[0].values.length === 0) return;

  for (const row of rows[0].values) {
    const [reservaId, salaId, status] = row as [number, number, string];

    db.run("UPDATE reservas SET mqtt_fim_enviado = 1 WHERE id = ?", [reservaId]);

    if (status === "pendente") {
      db.run("UPDATE reservas SET status = 'cancelada' WHERE id = ?", [reservaId]);
    }

    const outrasAtivas = db.exec(
      "SELECT COUNT(*) as c FROM reservas WHERE sala_id = ? AND status != 'cancelada' AND id != ?",
      [salaId, reservaId]
    );
    const count = outrasAtivas[0].values[0][0] as number;
    if (count === 0) {
      db.run("UPDATE salas SET status = 'livre' WHERE id = ?", [salaId]);
    }

    publishCommand(salaId, "liberar");

    console.log(`[MQTTScheduler] Reserva ${reservaId}: horário finalizado, comando "liberar" enviado para sala ${salaId}`);
  }

  saveDb();
}

function tick(): void {
  try {
    processOcupar();
    processAutoCancel();
    processLiberar();
  } catch (err) {
    console.error("[MQTTScheduler] Erro no ciclo de polling:", err);
  }
}

export function startMqttScheduler(): void {
  console.log("[MQTTScheduler] Iniciando polling a cada 60 segundos");
  tick();
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopMqttScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[MQTTScheduler] Polling parado");
  }
}