import { getUsers } from "../services/userService";
import UserCard from "../components/UserCard";
import { API_URL } from "@/lib/api"; // importando a URL da API

export default async function Home() {
// Exemplo usando API_URL diretamente
const response = await fetch(${API_URL}/api/users);
const usersFromApi = await response.json();

// Opcional: combinar com getUsers ou usar apenas usersFromApi
const users = await getUsers(); // se quiser manter getUsers

return (
<main style={{ padding: 40 }}>
Usuários

  {/* Se quiser usar a resposta direta da API */}
  {usersFromApi.map((user: any) => (
    <UserCard key={user.id} user={user} />
  ))}

  {/* Se quiser usar getUsers */}
  {/* {users.map((user) => (
    <UserCard key={user.id} user={user} />
  ))} */}
</main>

);
}