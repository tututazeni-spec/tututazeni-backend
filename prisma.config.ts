import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',

  experimental: {
    client: {
      datasourceUrl: process.env.DATABASE_URL
    },
  },
})