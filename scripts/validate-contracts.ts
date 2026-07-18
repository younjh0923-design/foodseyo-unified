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

const assertOrdered = (
  source: string,
  label: string,
  markers: readonly string[],
) => {
  let previousIndex = -1;

  for (const marker of markers) {
    const markerIndex = source.indexOf(marker);
    assert.notEqual(markerIndex, -1, `${label} is missing ${marker}`);
    assert(
      markerIndex > previousIndex,
      `${label} has an invalid order around ${marker}`,
    );
    previousIndex = markerIndex;
  }
};

const markdownTaskSection = (source: string, heading: string) => {
  const start = source.indexOf(heading);
  assert.notEqual(start, -1, `task master is missing ${heading}`);
  const remaining = source.slice(start + heading.length);
  const nextSection = remaining.search(/\n### /);
  return nextSection === -1 ? remaining : remaining.slice(0, nextSection);
};

const assertTaskStatus = (
  taskMaster: string,
  heading: string,
  expectedStatus: string,
) => {
  const section = markdownTaskSection(taskMaster, heading);
  assert(
    section.includes(`- **Status:** ${expectedStatus}`),
    `${heading} must be ${expectedStatus}`,
  );
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
assert.equal(
  [...runtimeNames, ...operatorNames].some(
    (name) =>
      name.startsWith("SUPABASE_") ||
      [
        "OPENAI_MODEL",
        "OPENAI_DEFAULT_MODEL",
        "OPENAI_VISION_MODEL",
        "OPENAI_MENU_MODEL",
      ].includes(name),
  ),
  false,
  "legacy environment names must not enter the unified registry",
);

const runtimeExample = await readFile(resolve(".env.example"), "utf8");
const operatorExample = await readFile(resolve(".env.operator.example"), "utf8");
const technologyStack = await readFile(resolve("docs/TECH_STACK.md"), "utf8");
const agentsGuide = await readFile(resolve("AGENTS.md"), "utf8");
const readme = await readFile(resolve("README.md"), "utf8");
const productFlow = await readFile(resolve("docs/PRODUCT_FLOW.md"), "utf8");
const sharedContracts = await readFile(
  resolve("docs/SHARED_CONTRACTS.md"),
  "utf8",
);
const contractChangeGuide = await readFile(
  resolve("docs/CONTRACT_CHANGE_GUIDE.md"),
  "utf8",
);
const taskMaster = await readFile(resolve("docs/TASK_MASTER.md"), "utf8");
const integrationProtocol = await readFile(
  resolve("docs/INTEGRATION_PROTOCOL.md"),
  "utf8",
);
const decisionLog = await readFile(resolve("docs/DECISION_LOG.md"), "utf8");
const pullRequestTemplate = await readFile(
  resolve(".github/pull_request_template.md"),
  "utf8",
);
assert(!runtimeExample.includes("DATABASE_MIGRATION_URL="));
assert(operatorExample.includes("DATABASE_MIGRATION_URL="));
assert.match(technologyStack, /Neon Serverless Postgres/);
assert.match(technologyStack, /Supabase is not part of the unified runtime/);
assert.match(technologyStack, /Vercel/);

assertOrdered(agentsGuide, "AGENTS required reading", [
  "`docs/SHARED_CONTRACTS.md`",
  "`docs/CONTRACT_CHANGE_GUIDE.md`",
  "`docs/TASK_MASTER.md`",
]);
assertOrdered(readme, "README start-here guide order", [
  "[Shared contracts](docs/SHARED_CONTRACTS.md)",
  "[Shared contract change guide](docs/CONTRACT_CHANGE_GUIDE.md)",
  "[Task master](docs/TASK_MASTER.md)",
]);
assertOrdered(integrationProtocol, "Codex handoff reading order", [
  "`docs/SHARED_CONTRACTS.md`",
  "`docs/CONTRACT_CHANGE_GUIDE.md`",
  "`docs/TASK_MASTER.md`",
]);
assertOrdered(contractChangeGuide, "contract change guide", [
  "## Is this a shared contract change?",
  "## Required workflow",
  "[CONTRACT CHANGE REQUEST]",
  "## Codex prompt template",
  "## Reviewer checklist",
]);
assert.match(taskMaster, /`CONTRACT_CHANGE_GUIDE\.md`/);
assert.match(pullRequestTemplate, /## Change classification/);
assert.match(
  pullRequestTemplate,
  /Contract version or cache identity impact:/,
);
assert.match(
  pullRequestTemplate,
  /`CONTRACT_CHANGE_GUIDE\.md` followed when a shared contract changed/,
);

assertOrdered(readme, "README submission flow", [
  "-> compact menu extraction",
  "-> Youn-owned canonical normalization",
  "-> Juhyung-owned menu and dish explanation",
  "-> Youn-owned database persistence",
]);
assertOrdered(productFlow, "product target flow", [
  "-> compact menu extraction",
  "-> evidence-priority merge",
  "-> structured validation",
  "-> Juhyung-owned constrained explanation rendering",
  "-> atomic persistence and publication",
]);
assertOrdered(integrationProtocol, "integration release chain", [
  "-> canonical validation",
  "-> explanation",
  "-> database",
  "-> mobile",
]);

const submissionDecision = decisionLog.slice(
  decisionLog.indexOf("## U-004 - Final submission flow is non-optional"),
  decisionLog.indexOf("## U-005 - Unified platform source of truth"),
);
assertOrdered(submissionDecision, "U-004 decision", [
  "OpenAI Web Search fallback",
  "Youn-owned canonical culinary consistency",
  "Juhyung-owned menu/dish",
  "Youn-owned database persistence",
]);

assert.match(productFlow, /## Submission Dish boundary/);
assert.match(sharedContracts, /### Minimum submission Dish contract/);
assert.match(
  integrationProtocol,
  /private-repository plan does not expose branch protection/,
);
assert.equal(
  /GPT-\d/i.test(taskMaster),
  false,
  "task master must not freeze an exact model before its configuration task",
);

const allowedTaskStatuses = new Set([
  "READY",
  "IN PROGRESS",
  "REVIEW",
  "BLOCKED",
  "DONE",
  "DEFERRED",
]);
for (const match of taskMaster.matchAll(/\*\*Status:\*\*\s+([^\r\n]+)/g)) {
  assert(
    allowedTaskStatuses.has(match[1].trim()),
    `task master contains unsupported status ${match[1].trim()}`,
  );
}

assertTaskStatus(taskMaster, "### U0.2 Common contract draft", "DONE");
assertTaskStatus(
  taskMaster,
  "### U1.1 Approve product and evidence invariants",
  "READY",
);
assertTaskStatus(taskMaster, "### U1.2 Freeze shared vocabulary", "BLOCKED");
assertTaskStatus(taskMaster, "### U1.3 Freeze boundary DTOs", "BLOCKED");
assertTaskStatus(
  taskMaster,
  "### U1.4 Freeze environment and feature-flag registry",
  "BLOCKED",
);
assertTaskStatus(taskMaster, "### U1.5 Freeze module interfaces", "BLOCKED");
assertTaskStatus(taskMaster, "### U2.4 Continuous integration", "BLOCKED");

console.log("Foodseyo shared contract validation passed.");
