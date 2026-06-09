import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import { JWT_SECRET } from "../middleware/auth";

const router = Router();

router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const { email, matricula, senha } = req.body;

  if (!email || !matricula || !senha) {
    res.status(400).json({ error: "Email, matrícula e senha são obrigatórios" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email já cadastrado" });
    return;
  }

  const hash = bcrypt.hashSync(senha, 10);

  const user = await prisma.user.create({
    data: { email, matricula, senhaHash: hash },
  });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1h" });

  res.status(201).json({ token, userId: user.id, email });
});

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    res.status(400).json({ error: "Email e senha são obrigatórios" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    res.status(401).json({ error: "Email ou senha inválidos" });
    return;
  }

  if (!bcrypt.compareSync(senha, user.senhaHash)) {
    res.status(401).json({ error: "Email ou senha inválidos" });
    return;
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

  res.json({ token, userId: user.id, email: user.email });
});

export default router;
