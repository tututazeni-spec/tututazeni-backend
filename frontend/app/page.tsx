import { getUsers } from "../services/userService";
import UserCard from "../components/UserCard";

export default async function Home() {
  const users = await getUsers();

  return (
    <main style={{ padding: 40 }}>
      <h1>Usuários</h1>

      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </main>
  );
}