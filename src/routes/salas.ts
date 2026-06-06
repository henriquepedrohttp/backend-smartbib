import { Router, Response } from "express";
import { getDb } from "../database";
import { getRoomStatus } from "../services/mqtt";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

const ALL_SLOTS = [
  { inicio: "08:00", fim: "09:00" },
  { inicio: "09:00", fim: "10:00" },
  { inicio: "10:00", fim: "11:00" },
  { inicio: "11:00", fim: "12:00" },
  { inicio: "13:00", fim: "14:00" },
  { inicio: "14:00", fim: "15:00" },
  { inicio: "15:00", fim: "16:00" },
  { inicio: "16:00", fim: "17:00" },
  { inicio: "17:00", fim: "18:00" },
  { inicio: "18:00", fim: "19:00" },
  { inicio: "19:00", fim: "20:00" },
  { inicio: "20:00", fim: "21:00" },
  { inicio: "21:00", fim: "22:00" },
];

router.get("/", authMiddleware, (_req: AuthRequest, res: Response): void => {
  const db = getDb();
  const rows = db.exec(
    "SELECT id, nome, capacidade, andar, recursos, icon, status FROM salas ORDER BY id"
  );

  const salas = rows[0]?.values.map((row: any[]) => {
    const [id, nome, capacidade, andar, recursos, icon, dbStatus] = row as [
      number, string, number, number, string, string, string
    ];
    const mqttStatus = getRoomStatus(id as number);
    const status = mqttStatus !== "livre" ? mqttStatus : dbStatus;

    return {
      id,
      nome,
      capacidade,
      andar,
      recursos: JSON.parse(recursos as string),
      icon,
      status,
    };
  }) || [];

  res.json(salas);
});

router.get("/:id/slots", authMiddleware, (req: AuthRequest, res: Response): void => {
  const salaId = parseInt(req.params.id, 10);
  const { data } = req.query;

  if (!data) {
    res.status(400).json({ error: "Parâmetro 'data' é obrigatório (YYYY-MM-DD)" });
    return;
  }

  const db = getDb();

  const reservasRows = db.exec(
    `SELECT hora_inicio, hora_fim FROM reservas
     WHERE sala_id = ? AND data = ? AND status != 'cancelada'`,
    [salaId, data as string]
  );

  const reservas: { hora_inicio: string; hora_fim: string }[] =
    reservasRows.length > 0
      ? reservasRows[0].values.map((row: any[]) => ({
          hora_inicio: row[0] as string,
          hora_fim: row[1] as string,
        }))
      : [];

  const slots = ALL_SLOTS.map(({ inicio, fim }) => {
    const conflito = reservas.some(
      (r) => r.hora_inicio < fim && r.hora_fim > inicio
    );
    return {
      inicio,
      fim,
      label: `${inicio} - ${fim}`,
      available: !conflito,
    };
  });

  res.json(slots);
});

export default router;
