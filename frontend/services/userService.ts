import { User } from "../types/user";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Buscar todos os usuários
export async function getUsers(): Promise<User[]> {
  const res = await fetch(`${BASE_URL}/api/users`, { cache: "no-store" });

  if (!res.ok) {
    throw new Error("Erro ao buscar usuários");
  }

  return res.json();
}

// Buscar usuário por ID
export async function getUserById(id: string): Promise<User> {
  const res = await fetch(`${BASE_URL}/api/users/${id}`, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Erro ao buscar usuário ${id}`);
  }

  return res.json();
}

// Criar usuário
export async function createUser(user: Omit<User, "id">): Promise<User> {
  const res = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });

  if (!res.ok) {
    throw new Error("Erro ao criar usuário");
  }

  return res.json();
}

// Atualizar usuário
export async function updateUser(id: string, user: Partial<User>): Promise<User> {
  const res = await fetch(`${BASE_URL}/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });

  if (!res.ok) {
    throw new Error(`Erro ao atualizar usuário ${id}`);
  }

  return res.json();
}

// Deletar usuário
export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/users/${id}`, { method: "DELETE" });

  if (!res.ok) {
    throw new Error(`Erro ao deletar usuário ${id}`);
  }
}