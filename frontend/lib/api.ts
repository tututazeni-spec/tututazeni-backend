export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function apiRequest(
  path: string,
  options: RequestInit = {},
  token?: string
) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Erro na API");
  }

  return res.json();
}
