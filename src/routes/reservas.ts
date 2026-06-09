import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { publishCommand } from "../services/mqtt";

const router = Router();

router.post("/", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { salaId, data, horaInicio, horaFim } = req.body;

  if (!salaId || !data || !horaInicio || !horaFim) {
    res.status(400).json({ error: "salaId, data, horaInicio e horaFim são obrigatórios" });
    return;
  }

  const sala = await prisma.sala.findUnique({ where: { id: salaId } });
  if (!sala) {
    res.status(404).json({ error: "Sala não encontrada" });
    return;
  }

  if (sala.status === "ocupada") {
    res.status(409).json({ error: `Sala ${sala.nome} está ocupada no momento` });
    return;
  }

  const conflito = await prisma.reserva.findFirst({
    where: {
      salaId,
      data,
      status: { not: "cancelada" },
      AND: [
        { NOT: { horaFim: { lte: horaInicio } } },
        { NOT: { horaInicio: { gte: horaFim } } },
      ],
    },
  });
  if (conflito) {
    res.status(409).json({ error: "Já existe uma reserva neste horário para esta sala" });
    return;
  }

  const reserva = await prisma.reserva.create({
    data: {
      userId: req.userId!,
      salaId,
      data,
      horaInicio,
      horaFim,
      status: "pendente",
      mqttInicioEnviado: 0,
      mqttFimEnviado: 0,
    },
  });

  res.status(201).json({
    id: reserva.id,
    salaId,
    nome: sala.nome,
    data,
    horaInicio,
    horaFim,
    status: "pendente",
  });
});

router.get("/", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const reservas = await prisma.reserva.findMany({
    where: { userId: req.userId },
    include: { sala: { select: { nome: true } } },
    orderBy: [{ data: "desc" }, { horaInicio: "desc" }],
  });

  const result = reservas.map((r) => ({
    id: r.id,
    salaId: r.salaId,
    roomName: r.sala.nome,
    date: r.data,
    time: `${r.horaInicio} - ${r.horaFim}`,
    status: r.status,
    horaInicio: r.horaInicio,
    horaFim: r.horaFim,
  }));

  res.json(result);
});

router.delete("/historico/limpar", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();

  const todasReservas = await prisma.reserva.findMany({ where: { userId } });

  const idsParaDeletar = todasReservas
    .filter((r) => {
      if (r.status === "cancelada") return true;
      const [h, m] = r.horaFim.split(":").map(Number);
      const fimReserva = new Date(`${r.data}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
      return fimReserva <= now;
    })
    .map((r) => r.id);

  if (idsParaDeletar.length > 0) {
    await prisma.reserva.deleteMany({ where: { id: { in: idsParaDeletar } } });
  }

  res.json({ message: "Histórico limpo com sucesso" });
});

router.delete("/:id/permanent", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const reservaId = parseInt(req.params.id, 10);
  if (isNaN(reservaId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const reserva = await prisma.reserva.findFirst({
    where: { id: reservaId, userId: req.userId },
  });

  if (!reserva) {
    res.status(404).json({ error: "Reserva não encontrada" });
    return;
  }

  const agora = new Date();
  const [h, m] = reserva.horaFim.split(":").map(Number);
  const fim = new Date(`${reserva.data}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

  if (reserva.status !== "cancelada" && fim > agora) {
    res.status(400).json({ error: "Não é possível excluir uma reserva ativa. Use 'Liberar' primeiro." });
    return;
  }

  await prisma.reserva.delete({ where: { id: reservaId } });

  res.json({ message: "Reserva removida permanentemente do histórico." });
});

router.delete("/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const reservaId = parseInt(req.params.id, 10);
  if (isNaN(reservaId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const reserva = await prisma.reserva.findFirst({
    where: { id: reservaId, userId: req.userId },
    include: { sala: { select: { nome: true } } },
  });

  if (!reserva) {
    res.status(404).json({ error: "Reserva não encontrada" });
    return;
  }

  if (reserva.status === "cancelada") {
    res.status(400).json({ error: "Reserva já está cancelada" });
    return;
  }

  await prisma.reserva.update({
    where: { id: reservaId },
    data: { status: "cancelada", mqttFimEnviado: 1 },
  });

  const outrasAtivas = await prisma.reserva.count({
    where: { salaId: reserva.salaId, status: { not: "cancelada" }, id: { not: reservaId } },
  });
  if (outrasAtivas === 0) {
    await prisma.sala.update({ where: { id: reserva.salaId }, data: { status: "livre" } });
  }

  if (reserva.mqttInicioEnviado === 1) {
    publishCommand(reserva.salaId, "liberar");
  }

  res.json({ message: `Reserva da ${reserva.sala.nome} cancelada com sucesso` });
});

router.post("/:id/ocupar", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const reservaId = parseInt(req.params.id, 10);
  if (isNaN(reservaId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const reserva = await prisma.reserva.findFirst({
    where: { id: reservaId, userId: req.userId },
  });

  if (!reserva) {
    res.status(404).json({ error: "Reserva não encontrada" });
    return;
  }

  if (reserva.status === "cancelada") {
    res.status(400).json({ error: "Reserva já foi cancelada" });
    return;
  }

  if (reserva.status === "confirmada") {
    res.status(400).json({ error: "Reserva já foi confirmada" });
    return;
  }

  const now = new Date();
  const [hiH, hiM] = reserva.horaInicio.split(":").map(Number);
  const [hfH, hfM] = reserva.horaFim.split(":").map(Number);
  const inicio = new Date(`${reserva.data}T${String(hiH).padStart(2, "0")}:${String(hiM).padStart(2, "0")}:00`);
  const fim = new Date(`${reserva.data}T${String(hfH).padStart(2, "0")}:${String(hfM).padStart(2, "0")}:00`);

  if (now < inicio || now > fim) {
    res.status(400).json({ error: "Só é possível confirmar a reserva durante o horário reservado" });
    return;
  }

  await prisma.reserva.update({
    where: { id: reservaId },
    data: { status: "confirmada", mqttInicioEnviado: 1, mqttInicioEnviadoAt: now },
  });

  await prisma.sala.update({ where: { id: reserva.salaId }, data: { status: "ocupada" } });

  publishCommand(reserva.salaId, "ocupar");

  res.json({ message: "Sala ocupada com sucesso" });
});

export default router;
