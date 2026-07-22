import { Pool } from "pg";

import {
  PgSqlTransactionRunner,
  PostgresMvpAnalysisRepository,
} from "./mvp-persistence.js";

let runtimePool: Pool | null = null;
let runtimeRepository: PostgresMvpAnalysisRepository | null = null;

const validateRuntimeDatabaseUrl = (value: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Foodseyo database runtime configuration is unavailable.");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname.includes("-pooler")
  ) {
    throw new Error("Foodseyo database runtime configuration is unavailable.");
  }
};

export const getRuntimeMvpAnalysisRepository = (
  databaseUrl: string,
): PostgresMvpAnalysisRepository => {
  validateRuntimeDatabaseUrl(databaseUrl);
  if (runtimeRepository === null) {
    runtimePool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    runtimeRepository = new PostgresMvpAnalysisRepository(
      new PgSqlTransactionRunner(runtimePool),
    );
  }
  return runtimeRepository;
};

export const closeRuntimeDatabasePoolForTests = async (): Promise<void> => {
  const pool = runtimePool;
  runtimePool = null;
  runtimeRepository = null;
  if (pool !== null) await pool.end();
};
