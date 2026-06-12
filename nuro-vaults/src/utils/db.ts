import { Pool } from "pg";

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://nuro:nuro@localhost:5432/nuro_vaults",
});
