export interface EventResponse {
  id: number;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  organizer: {
    id: number;
    fullName: string;
    email: string;
  };
  participants: {
    userId: number;
    status: string;
  }[];
}