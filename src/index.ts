import "dotenv/config";
import express from "express";
import cors from "cors";
import prisma from "./lib/prisma";
import { connectMQTT } from "./services/mqtt";
import { startMqttScheduler } from "./services/mqttScheduler";
import authRoutes from "./routes/auth";
import salasRoutes from "./routes/salas";
import reservasRoutes from "./routes/reservas";

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/salas", salasRoutes);
app.use("/api/reservas", reservasRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

async function start() {
  try {
    console.log("[Backend] Conectando ao banco de dados...");
    await prisma.$connect();
    console.log("[Backend] Banco de dados conectado");

    const salaCount = await prisma.sala.count();
    if (salaCount === 0) {
      console.log("[Backend] Tabela salas vazia, executando seed...");
      await prisma.sala.createMany({
        data: [
          {
            nome: "Sala 1",
            capacidade: 4,
            andar: 1,
            recursos: JSON.stringify(["quadro", "wifi", "ar-condicionado"]),
            icon: "users",
            status: "livre",
          },
          {
            nome: "Sala 2",
            capacidade: 6,
            andar: 1,
            recursos: JSON.stringify(["projetor", "wifi", "ar-condicionado"]),
            icon: "presentation",
            status: "livre",
          },
          {
            nome: "Sala 3",
            capacidade: 3,
            andar: 2,
            recursos: JSON.stringify(["tv", "wifi", "ar-condicionado"]),
            icon: "video",
            status: "livre",
          },
          {
            nome: "Sala 4",
            capacidade: 2,
            andar: 2,
            recursos: JSON.stringify(["quadro", "wifi"]),
            icon: "briefcase",
            status: "livre",
          },
        ],
      });
      console.log("[Backend] Seed concluído");
    }

    console.log("[Backend] Conectando ao MQTT...");
    await connectMQTT();
    console.log("[Backend] MQTT inicializado (conexão pode estar pendente)");

    console.log("[Backend] Iniciando agendador MQTT...");
    startMqttScheduler();

    app.listen(PORT, () => {
      console.log(`[Backend] Servidor rodando em http://localhost:${PORT}`);
      console.log("[Backend] Endpoints:");
      console.log("  POST /api/auth/register");
      console.log("  POST /api/auth/login");
      console.log("  GET  /api/salas");
      console.log("  POST /api/reservas");
      console.log("  GET  /api/reservas");
      console.log("  DELETE /api/reservas/:id");
      console.log("  POST /api/reservas/:id/ocupar");
    });
  } catch (err) {
    console.error("[Backend] Erro ao iniciar:", err);
    process.exit(1);
  }
}

start();
