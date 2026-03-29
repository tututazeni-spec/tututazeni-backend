import * as dotenv from "dotenv";
dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Garante que o role ADMIN existe
  await client.query(`
    INSERT INTO "Role" (name)
    VALUES ('ADMIN')
    ON CONFLICT (name) DO NOTHING
  `);

  // Busca o id do role
  const roleRes = await client.query(`SELECT id FROM "Role" WHERE name = 'ADMIN'`);
  const roleId = roleRes.rows[0].id;

  // Associa o role ao utilizador
  await client.query(
    `UPDATE "User" SET "roleId" = $1 WHERE email = 'admin@innova.com'`,
    [roleId]
  );

  console.log("✅ Role ADMIN atribuído ao utilizador com sucesso!");
  await client.end();
}

main().catch(console.error);