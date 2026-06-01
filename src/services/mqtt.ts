import mqtt, { MqttClient } from "mqtt";
import { getDb, saveDb } from "../database";

const BROKER_URL = "mqtt://broker.hivemq.com:1883";
const CLIENT_ID = "smartbib_backend_" + Math.random().toString(16).slice(2, 10);

let client: MqttClient;
const roomStatusCache = new Map<number, string>();

export function getRoomStatus(salaId: number): string {
  return roomStatusCache.get(salaId) || "livre";
}

export function connectMQTT(): Promise<void> {
  return new Promise((resolve, reject) => {
    client = mqtt.connect(BROKER_URL, {
      clientId: CLIENT_ID,
      clean: true,
      connectTimeout: 10000,
    });

    client.on("connect", () => {
      console.log("[MQTT] Conectado ao broker HiveMQ como", CLIENT_ID);
      client.subscribe("senac/biblioteca/+/status", (err) => {
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
      reject(err);
    });

    client.on("message", (topic, message) => {
      const payload = message.toString().trim();
      const match = topic.match(/^senac\/biblioteca\/sala(\d+)\/status$/);
      if (match) {
        const salaId = parseInt(match[1], 10);
        roomStatusCache.set(salaId, payload);
        console.log(`[MQTT] Status sala ${salaId}: ${payload}`);

        try {
          const db = getDb();
          db.run("UPDATE salas SET status = ? WHERE id = ?", [payload, salaId]);
          saveDb();
        } catch {}
      }
    });

    client.on("close", () => {
      console.log("[MQTT] Conexão fechada, reconectando em 5s...");
      setTimeout(() => connectMQTT().catch(console.error), 5000);
    });
  });
}

export function publishCommand(salaId: number, command: "reservar" | "ocupar" | "liberar"): void {
  const topic = `senac/biblioteca/sala${salaId}/comando`;
  if (client && client.connected) {
    client.publish(topic, command, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[MQTT] Erro ao publicar em ${topic}:`, err.message);
      } else {
        console.log(`[MQTT] Publicado: ${topic} -> "${command}"`);
      }
    });
  } else {
    console.warn("[MQTT] Cliente não conectado, não foi possível publicar");
  }
}

export function isMqttConnected(): boolean {
  return client?.connected ?? false;
}
