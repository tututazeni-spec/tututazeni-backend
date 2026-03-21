"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export default function UsersPage() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    async function loadUsers() {
      const data = await apiGet("/users");
      setUsers(data);
    }

    loadUsers();
  }, []);

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold mb-4">Lista de Utilizadores</h1>

      {users.map((user) => (
        <div
          key={user.id}
          className="p-4 border rounded mb-2"
        >
          {user.name}
        </div>
      ))}
    </div>
  );
}

