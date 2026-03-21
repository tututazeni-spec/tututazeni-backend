"use client";

import { useEffect, useState } from "react";
import { apiRequest } from '../../lib/api'; // caminho relativo correto

export default function UsersPage() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    async function loadUsers() {
      try {
        const data = await apiRequest("/users"); // usar apiRequest, não apiGet
        setUsers(data);
      } catch (error) {
        console.error("Erro ao carregar usuários:", error);
      }
    }

    loadUsers();
  }, []);

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold mb-4">Lista de Utilizadores</h1>

      {users.length === 0 ? (
        <p>Nenhum usuário encontrado.</p>
      ) : (
        users.map((user) => (
          <div key={user.id} className="p-4 border rounded mb-2">
            {user.name}
          </div>
        ))
      )}
    </div>
  );
}