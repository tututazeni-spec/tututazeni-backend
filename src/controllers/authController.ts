import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: "E-mail e palavra-passe são obrigatórios" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.status(401).json({ message: "Credenciais inválidas" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      res.status(401).json({ message: "Credenciais inválidas" });
      return;
    }

    const secret: string = process.env.JWT_SECRET!;
    if (!secret) {
      res.status(500).json({ message: "Configuração do servidor em falta" });
      return;
    }

    const payload = { sub: user.id, email: user.email };
    const options: SignOptions = {
      expiresIn: (process.env.JWT_EXPIRES_IN || "15m") as SignOptions["expiresIn"],
    };

    const accessToken = jwt.sign(payload, secret, options);

    res.json({ accessToken });
  } catch (error) {
    console.error("[auth/login] Erro interno:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
};