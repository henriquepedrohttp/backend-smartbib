import { Router, Response } from "express";
import { getDb, saveDb } from "../database";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { publishCommand } from "../services/mqtt";
import { scheduleAutoCancel } from "../services/scheduler";

const router = Router();

router.post("/", authMiddleware, (req: AuthRequest, res: Response): void => {
  const { salaId, data, horaInicio, horaFim } = req.body;

  if (!salaId || !data || !horaInicio || !horaFim) {
    res.status(400).json({ error: "salaId, data, horaInicio e horaFim são obrigatórios" });
    return;
  }

  const db = getDb();

  const sala = db.exec("SELECT id, nome, status FROM salas WHERE id = ?", [salaId]);
  if (sala.length === 0 || sala[0].values.length === 0) {
    res.status(404).json({ error: "Sala não encontrada" });
    return;
  }

  const [salaIdDb, nome, status] = sala[0].values[0] as [number, string, string];
  if (status !== "livre") {
    res.status(409).json({ error: `Sala ${nome} não está disponível (status: ${status})` });
    return;
  }

  const conflito = db.exec(
    `SELECT id FROM reservas
     WHERE sala_id = ? AND data = ? AND status != 'cancelada'
       AND hora_inicio < ? AND hora_fim > ?`,
    [salaId, data, horaFim, horaInicio]
  );
  if (conflito.length > 0 && conflito[0].values.length > 0) {
    res.status(409).json({ error: "Já existe uma reserva neste horário para esta sala" });
    return;
  }

  db.run(
    "INSERT INTO reservas (user_id, sala_id, data, hora_inicio, hora_fim, status) VALUES (?, ?, ?, ?, ?, 'pendente')",
    [req.userId, salaId, data, horaInicio, horaFim]
  );

  db.run("UPDATE salas SET status = 'reservada' WHERE id = ?", [salaId]);
  saveDb();

  const result = db.exec("SELECT last_insert_rowid() as id");
  const reservaId = result[0].values[0][0] as number;

  publishCommand(salaId, "reservar");

  scheduleAutoCancel(reservaId, salaId, 10);

  res.status(201).json({
    id: reservaId,
    salaId,
    nome,
    data,
    horaInicio,
    horaFim,
    status: "pendente",
  });
});

router.get("/", authMiddleware, (req: AuthRequest, res: Response): void => {
  const db = getDb();
  const rows = db.exec(
    `SELECT r.id, s.nome, r.data, r.hora_inicio, r.hora_fim, r.status, r.sala_id
     FROM reservas r
     JOIN salas s ON r.sala_id = s.id
     WHERE r.user_id = ?
     ORDER BY r.data DESC, r.hora_inicio DESC`,
    [req.userId]
  );

  const reservas = rows[0]?.values.map((row: any[]) => {
    const [id, roomName, date, timeStart, timeEnd, status, salaId] = row as [
      number, string, string, string, string, string, number
    ];
    return {
      id,
      salaId,
      roomName,
      date,
      time: `${timeStart} - ${timeEnd}`,
      status,
      horaInicio: timeStart,
      horaFim: timeEnd,
    };
  }) || [];

  res.json(reservas);
});

router.delete("/:id", authMiddleware, (req: AuthRequest, res: Response): void => {
  const reservaId = parseInt(req.params.id, 10);
  if (isNaN(reservaId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const db = getDb();
  const rows = db.exec(
    "SELECT r.id, r.sala_id, r.status, s.nome FROM reservas r JOIN salas s ON r.sala_id = s.id WHERE r.id = ? AND r.user_id = ?",
    [reservaId, req.userId]
  );

  if (rows.length === 0 || rows[0].values.length === 0) {
    res.status(404).json({ error: "Reserva não encontrada" });
    return;
  }

  const [id, salaId, status, nome] = rows[0].values[0] as [number, number, string, string];

  if (status === "cancelada") {
    res.status(400).json({ error: "Reserva já está cancelada" });
    return;
  }

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

  res.json({ message: `Reserva da ${nome} cancelada com sucesso` });
});

router.post("/:id/ocupar", authMiddleware, (req: AuthRequest, res: Response): void => {
  const reservaId = parseInt(req.params.id, 10);
  if (isNaN(reservaId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const db = getDb();
  const rows = db.exec(
    "SELECT r.id, r.sala_id, r.status FROM reservas r WHERE r.id = ? AND r.user_id = ?",
    [reservaId, req.userId]
  );

  if (rows.length === 0 || rows[0].values.length === 0) {
    res.status(404).json({ error: "Reserva não encontrada" });
    return;
  }

  const [id, salaId, status] = rows[0].values[0] as [number, number, string];

  if (status === "cancelada") {
    res.status(400).json({ error: "Reserva já foi cancelada" });
    return;
  }

  db.run("UPDATE reservas SET status = 'confirmada' WHERE id = ?", [reservaId]);
  db.run("UPDATE salas SET status = 'ocupada' WHERE id = ?", [salaId]);
  saveDb();

  publishCommand(salaId, "ocupar");

  res.json({ message: "Sala ocupada com sucesso" });
});

export default router;
