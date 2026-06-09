import { Router, Response } from "express";
import prisma from "../lib/prisma";
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
  { inicio: "22:00", fim: "23:00" },
];

router.get("/", authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  const salas = await prisma.sala.findMany({
    orderBy: { id: "asc" },
  });

  const result = salas.map((sala) => {
    const mqttStatus = getRoomStatus(sala.id);
    const status = mqttStatus !== "livre" ? mqttStatus : sala.status;

    return {
      id: sala.id,
      nome: sala.nome,
      capacidade: sala.capacidade,
      andar: sala.andar,
      recursos: JSON.parse(sala.recursos as string),
      icon: sala.icon,
      status,
    };
  });

  res.json(result);
});

router.get("/:id/slots", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const salaId = parseInt(req.params.id, 10);
  const { data } = req.query;

  if (!data) {
    res.status(400).json({ error: "Parâmetro 'data' é obrigatório (YYYY-MM-DD)" });
    return;
  }

  const reservas = await prisma.reserva.findMany({
    where: {
      salaId,
      data: data as string,
      status: { not: "cancelada" },
    },
    select: { horaInicio: true, horaFim: true },
  });

  const slots = ALL_SLOTS.map(({ inicio, fim }) => {
    const conflito = reservas.some(
      (r) => r.horaInicio < fim && r.horaFim > inicio
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
