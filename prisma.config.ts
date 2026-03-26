import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";

dotenv.config(); // ← carrega o .env antes de tudo

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: "prisma/migrations",
  },
});