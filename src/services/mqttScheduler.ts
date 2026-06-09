import prisma from "../lib/prisma";
import { publishCommand, isMqttConnected } from "./mqtt";

const POLL_INTERVAL_MS = 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

async function processOcupar(): Promise<void> {
  const connected = isMqttConnected();
  const now = new Date();

  const reservas = await prisma.reserva.findMany({
    where: {
      status: { not: "cancelada" },
      mqttInicioEnviado: 0,
    },
    select: { id: true, salaId: true, data: true, horaInicio: true },
  });

  const pendentes = reservas.filter((r) => {
    const [h, m] = r.horaInicio.split(":").map(Number);
    const inicio = new Date(`${r.data}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    return inicio <= now;
  });

  if (pendentes.length === 0) return;

  for (const r of pendentes) {
    publishCommand(r.salaId, "reservar");

    if (connected) {
      await prisma.reserva.update({
        where: { id: r.id },
        data: { mqttInicioEnviado: 1, mqttInicioEnviadoAt: now },
      });
      await prisma.sala.update({
        where: { id: r.salaId },
        data: { status: "reservada" },
      });
      console.log(`[MQTTScheduler] Reserva ${r.id}: comando "reservar" enviado para sala ${r.salaId}`);
    } else {
      console.warn(`[MQTTScheduler] Reserva ${r.id}: MQTT offline, tentará enviar "reservar" no próximo ciclo`);
    }
  }
}

async function processAutoCancel(): Promise<void> {
  const now = new Date();

  const reservas = await prisma.reserva.findMany({
    where: { status: "pendente" },
    select: { id: true, salaId: true, data: true, horaInicio: true, createdAt: true },
  });

  const cancela = reservas.filter((r) => {
    const [h, m] = r.horaInicio.split(":").map(Number);
    const inicio = new Date(`${r.data}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    const limite = new Date(inicio.getTime() + 5 * 60 * 1000);
    if (limite > now) return false;
    if (r.createdAt > inicio) return false;
    return true;
  });

  if (cancela.length === 0) return;

  for (const r of cancela) {
    await prisma.reserva.update({
      where: { id: r.id },
      data: { status: "cancelada", mqttFimEnviado: 1 },
    });

    const outrasAtivas = await prisma.reserva.count({
      where: { salaId: r.salaId, status: { not: "cancelada" }, id: { not: r.id } },
    });
    if (outrasAtivas === 0) {
      await prisma.sala.update({ where: { id: r.salaId }, data: { status: "livre" } });
    }

    publishCommand(r.salaId, "liberar");

    console.log(`[MQTTScheduler] Reserva ${r.id}: auto-cancelada (não confirmada em 5 minutos após o início)`);
  }
}

async function processLiberar(): Promise<void> {
  const now = new Date();

  const reservas = await prisma.reserva.findMany({
    where: {
      status: { not: "cancelada" },
      mqttFimEnviado: 0,
    },
    select: { id: true, salaId: true, status: true, data: true, horaFim: true },
  });

  const finalizadas = reservas.filter((r) => {
    const [h, m] = r.horaFim.split(":").map(Number);
    const fim = new Date(`${r.data}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    return fim <= now;
  });

  if (finalizadas.length === 0) return;

  for (const r of finalizadas) {
    await prisma.reserva.update({
      where: { id: r.id },
      data: { mqttFimEnviado: 1 },
    });

    if (r.status === "pendente") {
      await prisma.reserva.update({
        where: { id: r.id },
        data: { status: "cancelada" },
      });
    }

    const outrasAtivas = await prisma.reserva.count({
      where: { salaId: r.salaId, status: { not: "cancelada" }, id: { not: r.id } },
    });
    if (outrasAtivas === 0) {
      await prisma.sala.update({ where: { id: r.salaId }, data: { status: "livre" } });
    }

    publishCommand(r.salaId, "liberar");

    console.log(`[MQTTScheduler] Reserva ${r.id}: horário finalizado, comando "liberar" enviado para sala ${r.salaId}`);
  }
}

async function tick(): Promise<void> {
  try {
    await processOcupar();
    await processAutoCancel();
    await processLiberar();
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
