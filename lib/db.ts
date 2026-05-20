import { Pool } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

// Singleton pool — reused across hot reloads in dev, one per cold start in prod.
export const pool = globalThis._pgPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgPool = pool
}
