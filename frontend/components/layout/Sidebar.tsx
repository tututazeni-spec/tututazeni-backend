"use client";

import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen bg-gray-900 text-white p-6">
      <h2 className="text-xl mb-6">Dashboard</h2>

      <nav className="flex flex-col gap-4">
        <Link href="/dashboard">Home</Link>
        <Link href="/dashboard/users">Usuários</Link>
      </nav>
    </aside>
  );
}
