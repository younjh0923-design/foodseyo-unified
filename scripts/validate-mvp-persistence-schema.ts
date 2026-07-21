import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  MODULE_INTERFACE_VERSION,
  PublicationReceiptSchema,
} from "@foodseyo/contracts";
import { getTableName } from "drizzle-orm";

import { MVP_PERSISTENCE_TABLES } from "../packages/database/src/schema.js";

const expectedTables = [
  "analysis_contracts",
  "analysis_runs",
  "canonical_analyses",
  "dishes",
  "menu_evidence_sets",
  "menu_item_dish_matches",
  "menu_items",
  "publication_receipts",
  "restaurant_external_references",
  "restaurant_menu_versions",
  "restaurants",
] as const;

assert.deepEqual(
  MVP_PERSISTENCE_TABLES.map((table) => getTableName(table)).sort(),
  [...expectedTables],
  "Drizzle schema must expose exactly the approved eleven application tables",
);

const migrationsDirectory = resolve("packages/database/migrations");
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();
assert.equal(migrationFiles.length, 1, "DB-2 must contain one generated SQL migration");

const migration = await readFile(
  resolve(migrationsDirectory, migrationFiles[0]!),
  "utf8",
);
const createdTables = [...migration.matchAll(/CREATE TABLE "([^"]+)"/gu)]
  .map((match) => match[1]!)
  .sort();
assert.deepEqual(
  createdTables,
  [...expectedTables],
  "generated migration must create exactly the approved eleven tables",
);

assert.equal(
  (migration.match(/"canonical_analysis_json" jsonb NOT NULL/gu) ?? []).length,
  1,
  "canonical analysis JSON must be the sole JSONB storage column",
);
assert.doesNotMatch(
  migration.replace('"canonical_analysis_json" jsonb NOT NULL', ""),
  /\bjsonb\b/iu,
  "no other persistence column may use JSONB",
);
assert.doesNotMatch(migration, /CREATE TYPE/iu, "closed values use text plus CHECK");
assert.doesNotMatch(
  migration,
  /DEFAULT\s+(?:gen_random_uuid|uuid_generate)/iu,
  "database-generated identity is prohibited",
);
assert.doesNotMatch(
  migration,
  /(?:raw_url|image|base64|filename|provider_response|confidence)/iu,
  "sensitive payload and numeric-confidence columns are prohibited",
);

for (const marker of [
  'CONSTRAINT "restaurant_menu_versions_id_restaurant_uq" UNIQUE("id","restaurant_id")',
  'CONSTRAINT "publication_receipts_analysis_identity_fk" FOREIGN KEY ("analysis_id","restaurant_id","restaurant_menu_version_id")',
  'CONSTRAINT "publication_receipts_menu_restaurant_fk" FOREIGN KEY ("restaurant_menu_version_id","restaurant_id")',
  'CREATE UNIQUE INDEX "analysis_runs_one_processing_uq"',
  'CONSTRAINT "canonical_analyses_run_identity_fk"',
  "'module-interfaces/1.0.0'",
  "'analysis_only', 'eligible'",
  "'google_places'",
] as const) {
  assert(
    migration.includes(marker),
    `generated migration is missing required marker: ${marker}`,
  );
}

assert.equal(MODULE_INTERFACE_VERSION, "module-interfaces/1.0.0");
const publicReceipt = PublicationReceiptSchema.parse({
  contractVersion: MODULE_INTERFACE_VERSION,
  analysisId: "00000000-0000-4000-8000-000000000001",
  menuVersionId: "00000000-0000-4000-8000-000000000002",
  status: "published",
  publishedAt: "2026-07-21T12:00:00.000Z",
});
assert.deepEqual(Object.keys(publicReceipt).sort(), [
  "analysisId",
  "contractVersion",
  "menuVersionId",
  "publishedAt",
  "status",
]);
assert.equal(
  PublicationReceiptSchema.safeParse({
    ...publicReceipt,
    restaurantId: "00000000-0000-4000-8000-000000000003",
  }).success,
  false,
  "internal receipt columns must not expand the frozen public DTO",
);

console.log("Foodseyo MVP persistence Drizzle schema and migration validation passed.");
