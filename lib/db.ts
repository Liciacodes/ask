import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/lib/generated/prisma/client"

const globalForDb = globalThis as typeof globalThis & { db?: PrismaClient }

// The dev server reloads modules on every edit; reusing one client stops connections piling up.
const db = globalForDb.db ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

if (process.env.NODE_ENV !== "production") globalForDb.db = db

export { db }
