import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
export const db = databaseUrl
  ? drizzle(postgres(databaseUrl, { max: 1, prepare: false }), { schema })
  : null;
