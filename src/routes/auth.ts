import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb, saveDb } from "../database";
import { JWT_SECRET } from "../middleware/auth";

const router = Router();

router.post("/register", (req: Request, res: Response): void => {
  const { email, matricula, senha } = req.body;

  if (!email || !matricula || !senha) {
    res.status(400).json({ error: "Email, matrícula e senha são obrigatórios" });
    return;
  }

  const db = getDb();

  const existing = db.exec("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    res.status(409).json({ error: "Email já cadastrado" });
    return;
  }

  const hash = bcrypt.hashSync(senha, 10);
  db.run("INSERT INTO users (email, matricula, senha_hash) VALUES (?, ?, ?)", [email, matricula, hash]);
  saveDb();

  const result = db.exec("SELECT last_insert_rowid() as id");
  const userId = result[0].values[0][0] as number;

  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });

  res.status(201).json({ token, userId, email });
});

router.post("/login", (req: Request, res: Response): void => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    res.status(400).json({ error: "Email e senha são obrigatórios" });
    return;
  }

  const db = getDb();
  const rows = db.exec("SELECT id, email, senha_hash FROM users WHERE email = ?", [email]);

  if (rows.length === 0 || rows[0].values.length === 0) {
    res.status(401).json({ error: "Email ou senha inválidos" });
    return;
  }

  const [userId, userEmail, hash] = rows[0].values[0] as [number, string, string];

  if (!bcrypt.compareSync(senha, hash)) {
    res.status(401).json({ error: "Email ou senha inválidos" });
    return;
  }

  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });

  res.json({ token, userId, email: userEmail });
});

export default router;
