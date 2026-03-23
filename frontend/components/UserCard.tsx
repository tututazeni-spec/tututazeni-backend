export interface User {
  id: number;
  name: string;
  email: string;
}

interface UserCardProps {
  user: User;
}

export default function UserCard({ user }: UserCardProps) {
  return (
    <div className="p-4 border rounded mb-2">
      <h2 className="text-lg font-semibold">{user.name}</h2>
    </div>
  );
}