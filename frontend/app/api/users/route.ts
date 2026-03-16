import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json([
    { id: "1", name: "João Paulo", email: "joao@email.com" },
    { id: "2", name: "Maria Pinto", email: "maria@email.com" },
    { id: 3, name: "Pedro Costa", email: "pedro@email.com" },
  ]);
}