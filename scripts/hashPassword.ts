import * as dotenv from "dotenv";
dotenv.config();

import * as bcrypt from "bcrypt";
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const hash = await bcrypt.hash("NovaSenha123", 10);

  await client.query(
    `UPDATE "User" SET password = $1 WHERE email = $2`,
    [hash, "admin@innova.com"]
  );

  console.log("✅ Password actualizada com sucesso!");
  await client.end();
}

main().catch((e) => {
  console.error("❌ Erro:", e);
  process.exit(1);
});