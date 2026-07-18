import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BASIC_TASTES,
  CONTRACT_STATUS,
  CONTRACT_VERSIONS,
  EVIDENCE_BASES,
  FLAVOR_NOTES,
  HEAT_LEVELS,
  OPERATOR_ENV_NAMES,
  PUBLIC_ENV_NAMES,
  RICHNESS_LEVELS,
  SERVER_ENV_NAMES,
  TEXTURES,
} from "../packages/contracts/src/index.js";

const unique = (values: readonly string[], label: string) => {
  assert.equal(new Set(values).size, values.length, `${label} contains duplicates`);
};

unique(BASIC_TASTES, "BASIC_TASTES");
unique(FLAVOR_NOTES, "FLAVOR_NOTES");
unique(TEXTURES, "TEXTURES");
unique(HEAT_LEVELS, "HEAT_LEVELS");
unique(RICHNESS_LEVELS, "RICHNESS_LEVELS");
unique(EVIDENCE_BASES, "EVIDENCE_BASES");

for (const taste of BASIC_TASTES) {
  assert(!FLAVOR_NOTES.includes(taste as never), `${taste} crosses sensory axes`);
}

assert.notDeepEqual(HEAT_LEVELS, RICHNESS_LEVELS);
assert.deepEqual(EVIDENCE_BASES, [
  "source_stated",
  "inferred_from_source",
  "culinary_baseline",
  "unknown",
]);

assert.equal(CONTRACT_STATUS, "draft");
for (const version of Object.values(CONTRACT_VERSIONS)) {
  assert.match(version, /^[a-z-]+\/0\.1\.0$/);
}

const runtimeNames = Object.values(SERVER_ENV_NAMES);
const operatorNames = Object.values(OPERATOR_ENV_NAMES);
const publicNames = Object.values(PUBLIC_ENV_NAMES);
unique(runtimeNames, "SERVER_ENV_NAMES");
unique(operatorNames, "OPERATOR_ENV_NAMES");
assert.equal(
  runtimeNames.some((name) => operatorNames.includes(name as never)),
  false,
  "runtime and operator environment names overlap",
);
assert.equal(publicNames.length, 0, "no public environment variable is approved");
assert.equal(
  runtimeNames.includes("DATABASE_MIGRATION_URL" as never),
  false,
  "migration credential must not be available to runtime",
);

const runtimeExample = await readFile(resolve(".env.example"), "utf8");
const operatorExample = await readFile(resolve(".env.operator.example"), "utf8");
assert(!runtimeExample.includes("DATABASE_MIGRATION_URL="));
assert(operatorExample.includes("DATABASE_MIGRATION_URL="));

console.log("Foodseyo shared contract validation passed.");
