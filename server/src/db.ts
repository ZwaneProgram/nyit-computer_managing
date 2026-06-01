import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  // Fail loudly — almost every route needs the DB.
  console.warn('[db] DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.');
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params as never[]);
}
