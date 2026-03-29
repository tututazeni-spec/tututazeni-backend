import * as dotenv from "dotenv";
dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(
    `SELECT id, email, password FROM "User" WHERE email = 'admin@innova.com'`
  );

  console.log("Resultado:", res.rows);
  await client.end();
}

main().catch(console.error);