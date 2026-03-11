"use client";

import { useUsers } from "../../../hooks/useUsers";

export default function DashboardPage() {
  const { users, loading } = useUsers();

  if (loading) {
    return <p>Carregando usuários...</p>;
  }

  return (
    <main className="p-8">
      <h1 className="text-xl font-bold mb-4">Usuários</h1>

      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.name} - {user.email}
          </li>
        ))}
      </ul>
    </main>
  );
}
