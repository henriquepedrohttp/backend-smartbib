import { getDb, saveDb } from "../database";
import { publishCommand } from "./mqtt";

const timers = new Map<number, NodeJS.Timeout>();

export function scheduleAutoCancel(reservaId: number, salaId: number, minutes: number): void {
  const ms = minutes * 60 * 1000;
  console.log(`[Scheduler] Auto-cancelamento da reserva ${reservaId} em ${minutes} min`);

  const timer = setTimeout(() => {
    try {
      const db = getDb();
      const rows = db.exec(
        "SELECT status FROM reservas WHERE id = ?",
        [reservaId]
      );

      if (rows.length === 0 || rows[0].values.length === 0) return;

      const [status] = rows[0].values[0] as [string];

      if (status === "pendente") {
        console.log(`[Scheduler] Cancelando reserva ${reservaId} (não confirmada)`);

        db.run("UPDATE reservas SET status = 'cancelada' WHERE id = ?", [reservaId]);

        const outrasAtivas = db.exec(
          "SELECT COUNT(*) as c FROM reservas WHERE sala_id = ? AND status != 'cancelada' AND id != ?",
          [salaId, reservaId]
        );
        const count = outrasAtivas[0].values[0][0] as number;
        if (count === 0) {
          db.run("UPDATE salas SET status = 'livre' WHERE id = ?", [salaId]);
        }

        saveDb();
        publishCommand(salaId, "liberar");
      }
    } catch (err) {
      console.error("[Scheduler] Erro ao cancelar reserva:", err);
    }

    timers.delete(reservaId);
  }, ms);

  timers.set(reservaId, timer);
}

export function cancelAutoCancel(reservaId: number): void {
  const timer = timers.get(reservaId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(reservaId);
    console.log(`[Scheduler] Timer cancelado para reserva ${reservaId}`);
  }
}
