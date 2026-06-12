import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test before any test module initializes
dotenv.config({
  path: path.resolve(process.cwd(), '.env.test'),
  override: true,
});

// Salvaguarda: testes de BD correm SEMPRE contra innova_test (nunca innova/innova_dev)
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('innova_test')) {
  process.env.DATABASE_URL =
    'postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test';
}
