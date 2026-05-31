import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test before any test module initializes
dotenv.config({
  path: path.resolve(process.cwd(), '.env.test'),
  override: true,
});
