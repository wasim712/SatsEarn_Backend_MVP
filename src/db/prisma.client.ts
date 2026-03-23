import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../config/env';

// 1. Create a native Postgres connection pool using your env URL
const pool = new Pool({ 
  connectionString: env.DATABASE_URL 
});

// 2. Wrap the pool in Prisma's official Postgres Adapter
const adapter = new PrismaPg(pool as any);

// 3. Pass the adapter to the PrismaClient constructor (Required in Prisma 7)
export const prisma = new PrismaClient({ adapter });