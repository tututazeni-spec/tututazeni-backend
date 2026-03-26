import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
 
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
      },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar utilizadores' });
  }
};
 
export const createUser = async (req: Request, res: Response) => {
  const { email, fullName, password } = req.body;
  try {
    const user = await prisma.user.create({
      data: { email, fullName, password },
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar utilizador' });
  }
};
 