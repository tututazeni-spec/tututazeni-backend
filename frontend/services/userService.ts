import api from "./api"; // ✅ default import, corrigido

export type User = {
  id: string;
  name: string;
  email: string;
};

// Função para buscar todos os usuários
export async function getUsers(): Promise<User[]> {
  try {
    const response = await api.get<User[]>("/users"); // Tipagem garantida
    return response.data;
  } catch (error: any) {
    console.error("Erro ao buscar usuários:", error);
    throw error;
  }
}

// Função para buscar usuário por ID
export async function getUserById(id: string): Promise<User> {
  try {
    const response = await api.get<User>(`/users/${id}`);
    return response.data;
  } catch (error: any) {
    console.error(`Erro ao buscar usuário ${id}:`, error);
    throw error;
  }
}

// Função para criar um novo usuário
export async function createUser(user: Omit<User, "id">): Promise<User> {
  try {
    const response = await api.post<User>("/users", user);
    return response.data;
  } catch (error: any) {
    console.error("Erro ao criar usuário:", error);
    throw error;
  }
}

// Função para atualizar usuário
export async function updateUser(id: string, user: Partial<User>): Promise<User> {
  try {
    const response = await api.put<User>(`/users/${id}`, user);
    return response.data;
  } catch (error: any) {
    console.error(`Erro ao atualizar usuário ${id}:`, error);
    throw error;
  }
}

// Função para deletar usuário
export async function deleteUser(id: string): Promise<void> {
  try {
    await api.delete(`/users/${id}`);
  } catch (error: any) {
    console.error(`Erro ao deletar usuário ${id}:`, error);
    throw error;
  }
}
