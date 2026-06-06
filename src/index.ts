import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDb } from "./database";
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
    console.log("[Backend] Inicializando banco de dados...");
    await initDb();
    console.log("[Backend] Banco de dados inicializado");

    console.log("[Backend] Conectando ao MQTT...");
    await connectMQTT();
    console.log("[Backend] MQTT inicializado (conexao pode estar pendente)");

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
