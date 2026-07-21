import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const forbiddenTestEnvironmentNames = [
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "OPENAI_API_KEY",
  "OPENAI_MENU_EXTRACTION_MODEL",
  "OPENAI_WEB_SEARCH_MODEL",
  "OPENAI_EXPLANATION_MODEL",
  "GOOGLE_PLACES_API_KEY",
];

const configuredForbiddenNames = forbiddenTestEnvironmentNames.filter(
  (name) => typeof process.env[name] === "string" && process.env[name] !== "",
);
assert.deepEqual(
  configuredForbiddenNames,
  [],
  `Network-free validation forbids configured provider or database values: ${configuredForbiddenNames.join(", ")}`,
);

const guardUrl = pathToFileURL(resolve("scripts/deny-network.cjs")).href;
const probe = String.raw`
const assert = require("node:assert/strict");
const net = require("node:net");
const https = require("node:https");

assert.throws(
  () => net.connect(443, "127.0.0.1"),
  /Foodseyo network-free validation blocked/,
);
assert.throws(
  () => https.get("https://network-access-must-be-blocked.invalid"),
  /Foodseyo network-free validation blocked/,
);
assert.rejects(
  fetch("https://network-access-must-be-blocked.invalid"),
  /Foodseyo network-free validation blocked/,
).then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : "network guard failed");
    process.exit(1);
  },
);
`;

const result = spawnSync(process.execPath, ["--eval", probe], {
  encoding: "utf8",
  env: {
    ...process.env,
    NODE_OPTIONS: `--import=${guardUrl}`,
  },
});

assert.equal(
  result.status,
  0,
  `network-denial probe failed: ${result.stderr || result.stdout}`,
);
console.log("Foodseyo provider and database network denial passed.");
