import mqtt, { MqttClient } from "mqtt";
import prisma from "../lib/prisma";

const BROKER_URL = "mqtt://broker.hivemq.com:1883";

let client: MqttClient | null = null;
const roomStatusCache = new Map<number, string>();
let connectionAttempt = 0;
const MAX_RETRIES = 10;
const BASE_RETRY_MS = 2000;

export function getRoomStatus(salaId: number): string {
  return roomStatusCache.get(salaId) || "livre";
}

export function connectMQTT(): Promise<void> {
  return new Promise((resolve) => {
    const clientId = "smartbib_backend_" + Math.random().toString(16).slice(2, 10);

    client = mqtt.connect(BROKER_URL, {
      clientId,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 5000,
    });

    client.on("connect", () => {
      connectionAttempt = 0;
      console.log("[MQTT] Conectado ao broker HiveMQ como", clientId);
      client?.subscribe("senac/biblioteca/+/status", (err) => {
        if (err) {
          console.error("[MQTT] Erro ao subscrever:", err);
        } else {
          console.log("[MQTT] Subscrito em senac/biblioteca/+/status");
        }
      });
      resolve();
    });

    client.on("error", (err) => {
      console.error("[MQTT] Erro:", err.message);
      if (connectionAttempt < MAX_RETRIES) {
        connectionAttempt++;
        console.log(`[MQTT] Tentativa de reconexão ${connectionAttempt}/${MAX_RETRIES}`);
      } else {
        console.error("[MQTT] Máximo de tentativas atingido. Comandos MQTT serão ignorados até reconexão.");
      }
      resolve();
    });

    client.on("message", async (topic, message) => {
      const payload = message.toString().trim();
      const match = topic.match(/^senac\/biblioteca\/sala(\d+)\/status$/);
      if (match) {
        const salaId = parseInt(match[1], 10);
        roomStatusCache.set(salaId, payload);
        console.log(`[MQTT] Status sala ${salaId}: ${payload}`);

        try {
          await prisma.sala.update({
            where: { id: salaId },
            data: { status: payload },
          });
        } catch {}
      }
    });

    client.on("reconnect", () => {
      connectionAttempt = 0;
      console.log("[MQTT] Reconectando...");
    });

    client.on("offline", () => {
      console.warn("[MQTT] Cliente offline");
    });

    client.on("close", () => {
      console.log("[MQTT] Conexão fechada");
    });

    resolve();
  });
}

export function publishCommand(salaId: number, command: "reservar" | "ocupar" | "liberar"): void {
  const topic = `senac/biblioteca/sala${salaId}/comando`;
  if (!client) {
    console.warn("[MQTT] Cliente não inicializado");
    return;
  }
  if (!client.connected) {
    console.warn(`[MQTT] Cliente desconectado. Comando "${command}" para sala ${salaId} não enviado. Será processado no próximo ciclo do scheduler.`);
    return;
  }
  client.publish(topic, command, { qos: 1 }, (err) => {
    if (err) {
      console.error(`[MQTT] Erro ao publicar em ${topic}:`, err.message);
    } else {
      console.log(`[MQTT] Publicado: ${topic} -> "${command}"`);
    }
  });
}

export function isMqttConnected(): boolean {
  return client?.connected ?? false;
}
