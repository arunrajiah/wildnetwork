import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// Single shared postgres-js client; survives hot reload in dev via globalThis.
const g = globalThis as unknown as { __wnSql?: ReturnType<typeof postgres> };
export const sql = g.__wnSql ?? postgres(url, { max: 10, prepare: false });
if (process.env.NODE_ENV !== "production") g.__wnSql = sql;
