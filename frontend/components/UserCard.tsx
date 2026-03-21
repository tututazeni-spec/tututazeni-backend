import { User } from "../types/user";

interface Props {
  user: User;
}

export default function UserCard({ user }: Props) {
  return (
    <div className="p-4 border rounded mb-2">
      <h2 className="text-lg font-semibold">{user.name}</h2>
    </div>
  );
}