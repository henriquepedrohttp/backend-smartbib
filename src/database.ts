import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "smartbib.db");

let db: Database;

export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export async function initDb(): Promise<Database> {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      matricula TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS salas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      capacidade INTEGER NOT NULL,
      andar INTEGER NOT NULL,
      recursos TEXT DEFAULT '[]',
      icon TEXT DEFAULT 'users',
      status TEXT DEFAULT 'livre' CHECK(status IN ('livre', 'reservada', 'ocupada'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      sala_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fim TEXT NOT NULL,
      status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'confirmada', 'cancelada')),
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (sala_id) REFERENCES salas(id)
    )
  `);

  seedSalas();

  saveDb();
  return db;
}

function seedSalas(): void {
  const count = db.exec("SELECT COUNT(*) as c FROM salas");
  const total = count[0]?.values[0]?.[0] as number;
  if (total > 0) return;

  const insert = db.prepare(
    "INSERT INTO salas (nome, capacidade, andar, recursos, icon, status) VALUES (?, ?, ?, ?, ?, 'livre')"
  );

  insert.run(["Sala 1", 4, 1, JSON.stringify(["quadro", "wifi", "ar-condicionado"]), "users"]);
  insert.run(["Sala 2", 6, 1, JSON.stringify(["projetor", "wifi", "ar-condicionado"]), "presentation"]);
  insert.run(["Sala 3", 3, 2, JSON.stringify(["tv", "wifi", "ar-condicionado"]), "video"]);
  insert.run(["Sala 4", 2, 2, JSON.stringify(["quadro", "wifi"]), "briefcase"]);

  insert.free();
  saveDb();
}

export function saveDb(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}
