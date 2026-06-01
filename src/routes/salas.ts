import { Router, Response } from "express";
import { getDb } from "../database";
import { getRoomStatus } from "../services/mqtt";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

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

export default router;
