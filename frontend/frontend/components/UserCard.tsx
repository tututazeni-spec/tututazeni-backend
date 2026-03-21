import { User } from "../types/user";

interface Props {
  user: User;
}

export default function UserCard({ user }) {
  return (
    <div>
      <h2>{user.name}</h2>
    </div>
  );
}
