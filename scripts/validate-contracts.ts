import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  APPROVED_ENVIRONMENT_NAMES,
  BASIC_TASTE_ALIASES,
  BASIC_TASTES,
  CONTRACT_STATUS,
  CONTRACT_VERSIONS,
  DISH_MATCH_STATES,
  ENVIRONMENT_REGISTRY,
  EVIDENCE_BASES,
  FEATURE_FLAG_ENV_NAMES,
  FLAVOR_NOTE_DEFINITIONS,
  FLAVOR_NOTES,
  HEAT_ADJUSTABILITY_STATES,
  HEAT_LEVELS,
  INGREDIENT_ROLES,
  isApprovedEnvironmentName,
  isProhibitedEnvironmentName,
  KNOWLEDGE_ORIGIN_KINDS,
  KNOWLEDGE_REVIEW_STATES,
  LEGACY_ENVIRONMENT_NAMES,
  MENU_SCOPES,
  MENU_SOURCE_TYPES,
  MENU_VERSION_STATES,
  OPERATOR_ENV_NAMES,
  parseFeatureFlag,
  PUBLIC_ENV_NAMES,
  RESTAURANT_RESOLUTION_STATES,
  RICHNESS_LEVELS,
  RUNTIME_ENVIRONMENTS,
  SENSORY_AXES,
  SENSORY_VALUE_STATES,
  SERVER_ENV_NAMES,
  TEXTURE_DEFINITIONS,
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

const assertDescriptorDefinitions = (
  values: readonly string[],
  definitions: Readonly<
    Record<string, { readonly definition: string; readonly aliases: readonly string[] }>
  >,
  label: string,
) => {
  assert.deepEqual(Object.keys(definitions), values, `${label} keys drifted`);
  const normalizedTokens = new Set<string>(values);

  for (const value of values) {
    const descriptor = definitions[value];
    assert(descriptor, `${label} is missing ${value}`);
    assert(descriptor.definition.trim().length > 0, `${value} lacks a definition`);
    unique(descriptor.aliases, `${value} aliases`);

    for (const alias of descriptor.aliases) {
      assert.equal(
        normalizedTokens.has(alias),
        false,
        `${label} alias ${alias} collides with a canonical value or alias`,
      );
      normalizedTokens.add(alias);
    }
  }
};

const isObjectRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateEnumField = (
  fixture: Readonly<Record<string, unknown>>,
  field: string,
  allowedValues: readonly string[],
  issues: string[],
) => {
  const value = fixture[field];
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    issues.push(`invalid_${field}`);
  }
};

const validateStatefulField = (
  fixture: Readonly<Record<string, unknown>>,
  field: string,
  allowedValues: readonly string[],
  issues: string[],
) => {
  const selection = fixture[field];
  if (!isObjectRecord(selection)) {
    issues.push(`invalid_${field}_selection`);
    return;
  }

  if (!SENSORY_VALUE_STATES.includes(selection.state as never)) {
    issues.push(`invalid_${field}_state`);
    return;
  }

  if (selection.state === "unknown") {
    if ("value" in selection) {
      issues.push(`unknown_${field}_must_omit_value`);
    }
    return;
  }

  if (
    typeof selection.value !== "string" ||
    !allowedValues.includes(selection.value)
  ) {
    issues.push(`invalid_${field}_value`);
  }
};

const validateVocabularyFixture = (value: unknown): readonly string[] => {
  if (!isObjectRecord(value)) {
    return ["fixture_must_be_object"];
  }

  const issues: string[] = [];
  if ("taste" in value) {
    issues.push("generic_taste_forbidden");
  }

  validateEnumField(value, "basicTaste", BASIC_TASTES, issues);
  validateEnumField(value, "flavorNote", FLAVOR_NOTES, issues);
  validateEnumField(value, "texture", TEXTURES, issues);
  validateStatefulField(value, "heat", HEAT_LEVELS, issues);
  validateStatefulField(value, "richness", RICHNESS_LEVELS, issues);
  validateStatefulField(
    value,
    "heatAdjustability",
    HEAT_ADJUSTABILITY_STATES,
    issues,
  );
  validateEnumField(value, "ingredientRole", INGREDIENT_ROLES, issues);
  validateEnumField(value, "evidenceBasis", EVIDENCE_BASES, issues);
  validateEnumField(
    value,
    "restaurantResolutionState",
    RESTAURANT_RESOLUTION_STATES,
    issues,
  );
  validateEnumField(value, "menuSourceType", MENU_SOURCE_TYPES, issues);
  validateEnumField(value, "menuScope", MENU_SCOPES, issues);
  validateEnumField(value, "menuVersionState", MENU_VERSION_STATES, issues);
  validateEnumField(value, "dishMatchState", DISH_MATCH_STATES, issues);
  validateEnumField(value, "knowledgeOrigin", KNOWLEDGE_ORIGIN_KINDS, issues);
  validateEnumField(
    value,
    "knowledgeReviewState",
    KNOWLEDGE_REVIEW_STATES,
    issues,
  );

  return issues;
};

unique(SENSORY_AXES, "SENSORY_AXES");
unique(BASIC_TASTES, "BASIC_TASTES");
unique(FLAVOR_NOTES, "FLAVOR_NOTES");
unique(TEXTURES, "TEXTURES");
unique(HEAT_LEVELS, "HEAT_LEVELS");
unique(RICHNESS_LEVELS, "RICHNESS_LEVELS");
unique(SENSORY_VALUE_STATES, "SENSORY_VALUE_STATES");
unique(HEAT_ADJUSTABILITY_STATES, "HEAT_ADJUSTABILITY_STATES");
unique(INGREDIENT_ROLES, "INGREDIENT_ROLES");
unique(EVIDENCE_BASES, "EVIDENCE_BASES");
unique(RESTAURANT_RESOLUTION_STATES, "RESTAURANT_RESOLUTION_STATES");
unique(MENU_SOURCE_TYPES, "MENU_SOURCE_TYPES");
unique(MENU_SCOPES, "MENU_SCOPES");
unique(MENU_VERSION_STATES, "MENU_VERSION_STATES");
unique(DISH_MATCH_STATES, "DISH_MATCH_STATES");
unique(KNOWLEDGE_ORIGIN_KINDS, "KNOWLEDGE_ORIGIN_KINDS");
unique(KNOWLEDGE_REVIEW_STATES, "KNOWLEDGE_REVIEW_STATES");

assert.deepEqual(SENSORY_AXES, [
  "basic_taste",
  "flavor_note",
  "texture",
  "heat",
  "richness",
]);
assert.deepEqual(BASIC_TASTES, [
  "sweet",
  "salty",
  "sour",
  "bitter",
  "umami",
]);
assert.equal(BASIC_TASTES.includes("savory" as never), false);
assert.deepEqual(BASIC_TASTE_ALIASES, {
  savory: "umami",
  savoury: "umami",
});
assert.deepEqual(FLAVOR_NOTES, [
  "smoky",
  "herbal",
  "nutty",
  "earthy",
  "garlicky",
  "buttery",
  "cheesy",
  "fruity",
  "citrusy",
  "fermented",
]);
assert.deepEqual(TEXTURES, [
  "crispy",
  "crunchy",
  "creamy",
  "tender",
  "chewy",
  "juicy",
  "flaky",
  "soft",
  "firm",
  "dense",
  "airy",
  "silky",
  "sticky",
  "springy",
  "crumbly",
  "moist",
]);
assertDescriptorDefinitions(
  FLAVOR_NOTES,
  FLAVOR_NOTE_DEFINITIONS,
  "FLAVOR_NOTE_DEFINITIONS",
);
assertDescriptorDefinitions(
  TEXTURES,
  TEXTURE_DEFINITIONS,
  "TEXTURE_DEFINITIONS",
);
assert.deepEqual(
  Object.fromEntries(
    FLAVOR_NOTES.map((value) => [
      value,
      FLAVOR_NOTE_DEFINITIONS[value].aliases,
    ]),
  ),
  {
    smoky: ["smoked", "smoke-like"],
    herbal: ["herbaceous", "herb-like"],
    nutty: ["nut-like", "roasted-nut-like"],
    earthy: ["earth-like", "soil-like"],
    garlicky: ["garlic-forward", "garlic-like"],
    buttery: ["butter-like", "buttery-tasting"],
    cheesy: ["cheese-like", "cheesy-tasting"],
    fruity: ["fruit-forward", "fruit-like"],
    citrusy: ["citrus-forward", "citrus-like"],
    fermented: ["fermentative", "fermented-tasting"],
  },
);
assert.deepEqual(
  Object.fromEntries(
    TEXTURES.map((value) => [value, TEXTURE_DEFINITIONS[value].aliases]),
  ),
  {
    crispy: ["crisp", "crackly"],
    crunchy: ["crunch", "hard-crisp"],
    creamy: ["cream-like", "smooth-creamy"],
    tender: ["easy-to-bite", "fork-tender"],
    chewy: ["chewiness", "resilient-chew"],
    juicy: ["juice-releasing", "succulent"],
    flaky: ["layered-flaky", "flakes-apart"],
    soft: ["soft-textured", "easily-deformed"],
    firm: ["firm-textured", "holds-shape"],
    dense: ["compact", "heavy-textured"],
    airy: ["aerated", "light-and-airy"],
    silky: ["silken", "silky-smooth"],
    sticky: ["adhesive", "tacky"],
    springy: ["bouncy", "elastic"],
    crumbly: ["crumbles", "friable"],
    moist: ["moist-textured", "damp"],
  },
);

for (const taste of BASIC_TASTES) {
  assert(!FLAVOR_NOTES.includes(taste as never), `${taste} crosses sensory axes`);
}

assert.notDeepEqual(HEAT_LEVELS, RICHNESS_LEVELS);
assert.equal(HEAT_LEVELS.includes("unknown" as never), false);
assert.equal(RICHNESS_LEVELS.includes("unknown" as never), false);
assert.deepEqual(SENSORY_VALUE_STATES, ["known", "unknown"]);
assert.deepEqual(HEAT_ADJUSTABILITY_STATES, ["fixed", "user_selectable"]);
assert.equal(
  HEAT_LEVELS.some((value) => RICHNESS_LEVELS.includes(value as never)),
  false,
  "heat and richness values overlap",
);
assert.deepEqual(HEAT_LEVELS, [
  "none",
  "mild",
  "medium",
  "hot",
  "very_hot",
]);
assert.deepEqual(RICHNESS_LEVELS, ["light", "moderate", "rich"]);
assert.deepEqual(INGREDIENT_ROLES, [
  "core",
  "typical",
  "optional",
  "regional_variant",
  "preparation_dependent",
]);
assert.deepEqual(EVIDENCE_BASES, [
  "source_stated",
  "inferred_from_source",
  "culinary_baseline",
  "unknown",
]);
assert.deepEqual(RESTAURANT_RESOLUTION_STATES, [
  "candidate",
  "user_confirmed",
  "externally_verified",
  "rejected",
  "conflicting",
]);
assert.deepEqual(MENU_SOURCE_TYPES, [
  "uploaded_menu",
  "official_website",
  "official_pdf",
  "ordering_page",
  "web_search_discovery",
]);
assert.deepEqual(DISH_MATCH_STATES, [
  "candidate",
  "matched",
  "rejected",
  "unresolved",
]);
assert.equal(DISH_MATCH_STATES.includes("reviewed" as never), false);
assert.deepEqual(KNOWLEDGE_ORIGIN_KINDS, [
  "model_generated",
  "human_authored",
  "imported",
]);
assert.deepEqual(KNOWLEDGE_REVIEW_STATES, [
  "unreviewed",
  "reviewed",
  "superseded",
  "retired",
]);
assert.equal(
  KNOWLEDGE_REVIEW_STATES.includes("model_generated" as never),
  false,
);
assert.deepEqual(MENU_SCOPES, [
  "default",
  "all_day",
  "breakfast",
  "brunch",
  "lunch",
  "dinner",
  "drinks",
  "dessert",
  "happy_hour",
  "kids",
  "late_night",
  "seasonal",
]);
assert.deepEqual(MENU_VERSION_STATES, [
  "draft",
  "active",
  "stale",
  "superseded",
  "retired",
]);
assert.match(
  FLAVOR_NOTE_DEFINITIONS.nutty.definition,
  /not evidence that nuts are present/,
);
for (const descriptor of ["buttery", "cheesy"] as const) {
  assert.match(
    FLAVOR_NOTE_DEFINITIONS[descriptor].definition,
    /not evidence that dairy is present/,
  );
}
assert.match(
  TEXTURE_DEFINITIONS.creamy.definition,
  /not evidence that dairy is present/,
);

assert.equal(CONTRACT_STATUS, "draft");
for (const version of Object.values(CONTRACT_VERSIONS)) {
  assert.match(version, /^[a-z-]+\/0\.1\.0$/);
}

const runtimeNames = Object.values(SERVER_ENV_NAMES);
const operatorNames = Object.values(OPERATOR_ENV_NAMES);
const publicNames = Object.values(PUBLIC_ENV_NAMES);
const approvedEnvironmentNames = [...APPROVED_ENVIRONMENT_NAMES];
unique(runtimeNames, "SERVER_ENV_NAMES");
unique(operatorNames, "OPERATOR_ENV_NAMES");
unique(approvedEnvironmentNames, "APPROVED_ENVIRONMENT_NAMES");
assert.deepEqual(approvedEnvironmentNames, [...runtimeNames, ...operatorNames]);
assert.deepEqual(Object.keys(ENVIRONMENT_REGISTRY), approvedEnvironmentNames);
assert.deepEqual(LEGACY_ENVIRONMENT_NAMES, [
  "OPENAI_MODEL",
  "OPENAI_DEFAULT_MODEL",
  "OPENAI_VISION_MODEL",
  "OPENAI_MENU_MODEL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);
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
for (const name of approvedEnvironmentNames) {
  const entry = ENVIRONMENT_REGISTRY[name];
  assert.equal(entry.name, name);
  assert.equal(entry.neverLogValue, true);
  assert.equal(isApprovedEnvironmentName(name), true);
  assert.equal(isProhibitedEnvironmentName(name), false);
  assert.deepEqual(Object.keys(entry.environmentPolicy), RUNTIME_ENVIRONMENTS);

  if (entry.secretClass === "secret") {
    assert.equal(
      entry.environmentPolicy.test,
      "forbidden",
      `${name} secret must be forbidden in network-free tests`,
    );
  }
}
for (const name of LEGACY_ENVIRONMENT_NAMES) {
  assert.equal(isApprovedEnvironmentName(name), false);
  assert.equal(isProhibitedEnvironmentName(name), true);
}
assert.equal(isProhibitedEnvironmentName("NEXT_PUBLIC_OPENAI_API_KEY"), true);
assert.equal(isProhibitedEnvironmentName("NEXT_PUBLIC_DATABASE_URL"), true);
assert.equal(
  ENVIRONMENT_REGISTRY.DATABASE_URL.validationRule,
  "pooled_postgres_url",
);
assert.equal(ENVIRONMENT_REGISTRY.DATABASE_URL.boundary, "server_runtime");
assert.equal(
  ENVIRONMENT_REGISTRY.DATABASE_MIGRATION_URL.validationRule,
  "direct_postgres_url",
);
assert.equal(
  ENVIRONMENT_REGISTRY.DATABASE_MIGRATION_URL.boundary,
  "operator_only",
);
assert.deepEqual(FEATURE_FLAG_ENV_NAMES, [
  "FEATURE_RESTAURANT_RESOLUTION",
  "FEATURE_WEB_SEARCH_DISCOVERY",
  "FEATURE_DISH_KNOWLEDGE_REUSE",
]);
for (const name of FEATURE_FLAG_ENV_NAMES) {
  const entry = ENVIRONMENT_REGISTRY[name];
  assert.equal(entry.secretClass, "non_secret");
  assert.equal(entry.validationRule, "boolean_literal");
  assert.equal(entry.defaultBehavior, "fail_closed_false");
}
assert.equal(parseFeatureFlag("true"), true);
for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
  assert.equal(parseFeatureFlag(value), false);
}

const runtimeExample = await readFile(resolve(".env.example"), "utf8");
const operatorExample = await readFile(resolve(".env.operator.example"), "utf8");
const technologyStack = await readFile(resolve("docs/TECH_STACK.md"), "utf8");
const environmentRegistry = await readFile(
  resolve("docs/ENVIRONMENT_REGISTRY.md"),
  "utf8",
);
const agentsGuide = await readFile(resolve("AGENTS.md"), "utf8");
const readme = await readFile(resolve("README.md"), "utf8");
const productFlow = await readFile(resolve("docs/PRODUCT_FLOW.md"), "utf8");
const sharedContracts = await readFile(
  resolve("docs/SHARED_CONTRACTS.md"),
  "utf8",
);
const sensoryVocabulary = await readFile(
  resolve("docs/SENSORY_VOCABULARY.md"),
  "utf8",
);
const boundaryDtos = await readFile(
  resolve("docs/BOUNDARY_DTOS.md"),
  "utf8",
);
const moduleInterfaces = await readFile(
  resolve("docs/MODULE_INTERFACES.md"),
  "utf8",
);
const contractChangeGuide = await readFile(
  resolve("docs/CONTRACT_CHANGE_GUIDE.md"),
  "utf8",
);
const contractChangeQueue = await readFile(
  resolve("docs/CONTRACT_CHANGE_QUEUE.md"),
  "utf8",
);
const taskMaster = await readFile(resolve("docs/TASK_MASTER.md"), "utf8");
const integrationProtocol = await readFile(
  resolve("docs/INTEGRATION_PROTOCOL.md"),
  "utf8",
);
const decisionLog = await readFile(resolve("docs/DECISION_LOG.md"), "utf8");
const teamOwnership = await readFile(
  resolve("docs/TEAM_OWNERSHIP.md"),
  "utf8",
);
const pullRequestTemplate = await readFile(
  resolve(".github/pull_request_template.md"),
  "utf8",
);
const contractChangeIssueTemplate = await readFile(
  resolve(".github/ISSUE_TEMPLATE/contract-change.yml"),
  "utf8",
);
const codeOwners = await readFile(resolve(".github/CODEOWNERS"), "utf8");
const webPackage = await readFile(resolve("apps/web/README.md"), "utf8");
const restaurantPackage = await readFile(
  resolve("packages/restaurant-resolution/README.md"),
  "utf8",
);
const sourcePackage = await readFile(
  resolve("packages/source-acquisition/README.md"),
  "utf8",
);
const menuAnalysisPackage = await readFile(
  resolve("packages/menu-analysis/README.md"),
  "utf8",
);
const contractsPackage = await readFile(
  resolve("packages/contracts/README.md"),
  "utf8",
);
const dishKnowledgePackage = await readFile(
  resolve("packages/dish-knowledge/README.md"),
  "utf8",
);
const mergePolicyPackage = await readFile(
  resolve("packages/merge-policy/README.md"),
  "utf8",
);
const databasePackage = await readFile(
  resolve("packages/database/README.md"),
  "utf8",
);
const observabilityPackage = await readFile(
  resolve("packages/observability/README.md"),
  "utf8",
);
assert(!runtimeExample.includes("DATABASE_MIGRATION_URL="));
assert(operatorExample.includes("DATABASE_MIGRATION_URL="));
for (const name of runtimeNames) {
  assert.match(runtimeExample, new RegExp(`^${name}=`, "m"));
}
for (const name of [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_MENU_EXTRACTION_MODEL",
  "OPENAI_WEB_SEARCH_MODEL",
  "OPENAI_EXPLANATION_MODEL",
  "GOOGLE_PLACES_API_KEY",
]) {
  assert.match(runtimeExample, new RegExp(`^${name}=$`, "m"));
}
assert.match(operatorExample, /^DATABASE_MIGRATION_URL=$/m);
assert.match(technologyStack, /Neon Serverless Postgres/);
assert.match(technologyStack, /Supabase is not part of the unified runtime/);
assert.match(technologyStack, /Vercel/);
assert.match(
  technologyStack,
  /value-free owner[\s\S]*`ENVIRONMENT_REGISTRY\.md`[\s\S]*`@foodseyo\/contracts`/,
);
for (const marker of [
  "`environment-registry/0.1.0`",
  "contains no environment values",
  "## Approved server-runtime variables",
  "## Operator-only variable",
  "Only the exact lowercase string `true` enables a feature",
  "no `NEXT_PUBLIC_*` environment name is approved",
  "no `SUPABASE_*` name is approved",
  "application runtime cannot read the operator registry",
]) {
  assert(
    environmentRegistry.includes(marker),
    `environment registry documentation is missing ${marker}`,
  );
}
assert.match(
  decisionLog,
  /## U-011 - Value-free environment and feature-flag registry[\s\S]*issue #7[\s\S]*PR #9[\s\S]*e1dac696da91d82d715ae70b513ebef757957980[\s\S]*\*\*Status:\*\* Accepted/,
);

assertOrdered(agentsGuide, "AGENTS required reading", [
  "`docs/SHARED_CONTRACTS.md`",
  "`docs/SENSORY_VOCABULARY.md`",
  "`docs/BOUNDARY_DTOS.md`",
  "`docs/MODULE_INTERFACES.md`",
  "`docs/CONTRACT_CHANGE_GUIDE.md`",
  "`docs/CONTRACT_CHANGE_QUEUE.md`",
  "`docs/TASK_MASTER.md`",
]);
assertOrdered(readme, "README start-here guide order", [
  "[Shared contracts](docs/SHARED_CONTRACTS.md)",
  "[Sensory vocabulary](docs/SENSORY_VOCABULARY.md)",
  "[Boundary DTOs](docs/BOUNDARY_DTOS.md)",
  "[Module interfaces](docs/MODULE_INTERFACES.md)",
  "[Shared contract change guide](docs/CONTRACT_CHANGE_GUIDE.md)",
  "[Contract change queue](docs/CONTRACT_CHANGE_QUEUE.md)",
  "[Task master](docs/TASK_MASTER.md)",
]);
assertOrdered(integrationProtocol, "Codex handoff reading order", [
  "`docs/SHARED_CONTRACTS.md`",
  "`docs/SENSORY_VOCABULARY.md`",
  "`docs/BOUNDARY_DTOS.md`",
  "`docs/MODULE_INTERFACES.md`",
  "`docs/CONTRACT_CHANGE_GUIDE.md`",
  "`docs/CONTRACT_CHANGE_QUEUE.md`",
  "`docs/TASK_MASTER.md`",
]);
for (const marker of [
  "`boundary-dtos/0.1.0`",
  "remains `draft` until U1.6",
  "`CompactMenuExtraction` is provider-neutral but explicitly",
  "`unvalidated`",
  "`MenuItemDishMatch` is the evidence-bearing many-to-many relationship",
  "source_stated",
  "inferred_from_source",
  "reviewed culinary_baseline",
  "`unknown`, with no value, claim, or provenance",
  "does not implement a provider",
  "does not decide:",
]) {
  assert(
    boundaryDtos.includes(marker),
    `boundary DTO documentation is missing ${marker}`,
  );
}
for (const marker of [
  "`module-interfaces/0.1.0`",
  "remains `draft` and unavailable to feature code until U1.6",
  "`PortInvocationContext`",
  "`PortResult<T>`",
  "`isPublicationEligibleAnalysis`",
  "All seven packages depend only on `@foodseyo/contracts`",
  "The direct YTW-to-Juhyung lane",
  "deterministic call count",
  "Never import another package's `src/` path",
  "all U2 feature work remains blocked",
]) {
  assert(
    moduleInterfaces.includes(marker),
    `module-interface documentation is missing ${marker}`,
  );
}
for (const marker of [
  "`@foodseyo/contracts`",
  "`@foodseyo/contracts/boundary-dtos`",
  "`@foodseyo/contracts/module-interfaces`",
  "`0.1.0`/`draft`",
  "unavailable to feature code until U1.6",
]) {
  assert(
    contractsPackage.includes(marker),
    `contracts package documentation is missing ${marker}`,
  );
}
assert.match(
  sharedContracts,
  /`BOUNDARY_DTOS\.md`[\s\S]*`boundary-dtos\/0\.1\.0`[\s\S]*unavailable to feature code/,
);
assert.match(
  decisionLog,
  /## U-012 - Typed boundary DTOs and derived Dish profiles[\s\S]*Issue #10[\s\S]*PR #12[\s\S]*6c7c3d32029674405f111d93bb4cd9982830400d[\s\S]*8050bc44cff2880b97b08576282565e1f44ed27c[\s\S]*\*\*Status:\*\* Accepted/,
);
assert.match(
  decisionLog,
  /## U-013 - Provider-neutral module ports and deterministic fakes[\s\S]*Issue #14[\s\S]*PR #15[\s\S]*b77fcdbeb0a15948a0dd529ea1c4ef739483dccb[\s\S]*e732983d1b44d282907d85b6d0ea4132984cc3bb[\s\S]*status:merged[\s\S]*\*\*Status:\*\* Accepted/,
);
assert.match(
  contractChangeQueue,
  /Keep an approved proposal open with `status:approved`[\s\S]*Only after that PR merges[\s\S]*`status:merged`[\s\S]*close/,
);
assert.match(
  contractChangeGuide,
  /move the still-open proposal from `status:approved` to `status:merged`[\s\S]*never close it merely because the proposal direction was\s+approved/,
);
for (const [name, documentation] of [
  ["restaurant-resolution", restaurantPackage],
  ["source-acquisition", sourcePackage],
  ["menu-analysis", menuAnalysisPackage],
  ["dish-knowledge", dishKnowledgePackage],
  ["merge-policy", mergePolicyPackage],
  ["database", databasePackage],
  ["observability", observabilityPackage],
] as const) {
  assert.match(documentation, /U1\.5 public surface|U1\.5 keeps/);
  assert.match(
    documentation,
    /deterministic\s+(?:fake|fakes|recorder fake)/,
    `${name} must document its deterministic fake boundary`,
  );
}
assertOrdered(contractChangeGuide, "contract change guide", [
  "## Is this a shared contract change?",
  "## Required workflow",
  "[CONTRACT CHANGE REQUEST]",
  "## Codex prompt template",
  "## Reviewer checklist",
]);
assert.match(taskMaster, /`CONTRACT_CHANGE_GUIDE\.md`/);
assert.match(taskMaster, /`CONTRACT_CHANGE_QUEUE\.md`/);
assert.match(pullRequestTemplate, /## Change classification/);
assert.match(pullRequestTemplate, /Contract queue issue:/);
assert.match(pullRequestTemplate, /Approval tier:/);
assert.match(pullRequestTemplate, /Affected owners:/);
assert.match(
  pullRequestTemplate,
  /Contract version or cache identity impact:/,
);
assert.match(
  pullRequestTemplate,
  /`CONTRACT_CHANGE_GUIDE\.md` followed when a shared contract changed/,
);
assert.match(
  pullRequestTemplate,
  /No raw source URL appears in logs or public errors/,
);
assert.match(
  pullRequestTemplate,
  /Provider photo\/reference persistence boundary reviewed/,
);
assert.match(pullRequestTemplate, /Ownership or handoff impact:/);
assert.match(
  pullRequestTemplate,
  /Required impact-tier owner approvals recorded before merge/,
);

assertOrdered(contractChangeQueue, "contract change queue", [
  "## GitHub labels",
  "## Approval tiers",
  "## Codex startup queue check",
  "## Concurrency rules",
  "## Required issue contents",
]);
for (const marker of [
  "type:contract-change",
  "status:proposed",
  "status:implemented",
  "area:cross-workstream",
  "review:youn",
  "review:ytw",
  "review:juhyung",
  "`scoped-shared`",
  "`cross-cutting`",
  "`final-freeze`",
  "Registration is not approval",
  "Silence is never approval",
]) {
  assert.match(contractChangeQueue, new RegExp(marker.replaceAll("*", "\\*")));
}
assert.match(
  contractChangeQueue,
  /Failure to access GitHub is not evidence that the queue is empty/,
);
assert.match(
  contractChangeIssueTemplate,
  /title: "\[CONTRACT CHANGE\] "/,
);
assert.match(contractChangeIssueTemplate, /"type:contract-change"/);
assert.match(contractChangeIssueTemplate, /"status:proposed"/);
for (const issueField of [
  "id: requester",
  "id: task",
  "id: area",
  "id: tier",
  "id: reviewers",
  "id: proposal",
  "id: impact",
  "id: version",
  "id: examples",
  "id: unresolved",
]) {
  assert.match(contractChangeIssueTemplate, new RegExp(issueField));
}
assert.match(
  contractChangeIssueTemplate,
  /No dependent implementation, temporary enum, environment alias, migration, provider call, or deployment has been added/,
);
assert.match(
  agentsGuide,
  /inspect every open GitHub[\s\S]*contract-change proposal/,
);
assert.match(
  integrationProtocol,
  /scans the[\s\S]*complete open contract-change queue/,
);
assert.match(
  teamOwnership,
  /Anyone may register a contract proposal without approval/,
);
assert.match(
  decisionLog,
  /## U-009 - Queued proposals and impact-tier contract approval[\s\S]*PR #4 head[\s\S]*\*\*Status:\*\* Accepted/,
);
assert.equal(
  agentsGuide.includes(
    "Contract changes require a dedicated contract PR and review from all three",
  ),
  false,
  "AGENTS must use impact-tier approval",
);

assertOrdered(readme, "README submission flow", [
  "-> YTW-owned compact menu extraction",
  "-> Youn-owned canonical normalization",
  "-> Juhyung-owned menu and dish explanation",
  "-> Youn-owned database persistence",
  "-> Juhyung-owned mobile ordering-decision experience",
]);
assertOrdered(productFlow, "product target flow", [
  "-> YTW-owned compact menu extraction",
  "-> evidence-priority merge",
  "-> structured validation",
  "-> Juhyung-owned constrained explanation rendering",
  "-> atomic persistence and publication",
]);
assertOrdered(integrationProtocol, "integration release chain", [
  "-> compact extraction",
  "-> canonical validation",
  "-> explanation",
  "-> database",
  "-> mobile",
]);
assert.match(
  contractChangeGuide,
  /Raw source URLs must never appear in logs or public-error payloads\./,
);
assert.match(
  contractChangeGuide,
  /Google Place ID is the explicit external-identity exception/,
);
assert.match(
  contractChangeGuide,
  /Changing explanation retry behavior, deterministic-fallback behavior, or[\s\S]*explanation-renderer semantics is a shared semantic change\./,
);
assert.match(
  sharedContracts,
  /Raw discovered, redirect, and ordering URLs never appear in logs or public[\s\S]*errors\./,
);
assert.match(
  sharedContracts,
  /Restaurant photo bytes and opaque or short-lived Google photo\/provider[\s\S]*Google Place ID remains[\s\S]*external-identity exception\./,
);
assertOrdered(sensoryVocabulary, "sensory axes", [
  "| Basic taste |",
  "| Flavor note |",
  "| Texture |",
  "| Heat |",
  "| Richness |",
]);
for (const sourceMarker of [
  "ISO 5492:2008",
  "ISO 11035:1994",
  "ISO 13299:2016",
  "ISO 11036:2020",
  "ISO 4121:2003",
  "nidcd.nih.gov/health/taste-disorders",
  "pmc.ncbi.nlm.nih.gov/articles/PMC4667542/",
]) {
  assert.match(
    sensoryVocabulary,
    new RegExp(sourceMarker.replaceAll(".", "\\.")),
  );
}
for (const contractMarker of [
  "standards-informed",
  "does not claim",
  "There is no generic `taste` field",
  "`savory` and `savoury` are accepted input aliases",
  "not a heat or richness level",
  "Heat adjustability is independent",
  "Perceptual descriptors are not ingredient claims",
  "`model_generated`, `human_authored`, or `imported`",
]) {
  assert(
    sensoryVocabulary.includes(contractMarker),
    `sensory vocabulary is missing ${contractMarker}`,
  );
}
assert.match(
  decisionLog,
  /## U-010 - Standards-informed sensory vocabulary boundaries[\s\S]*issue #6[\s\S]*PR #8[\s\S]*7c537e19c133285b50bbc096f38510c63a063e56[\s\S]*\*\*Status:\*\* Accepted/,
);

const validVocabularyFixture = JSON.parse(
  await readFile(
    resolve("packages/contracts/fixtures/vocabulary.valid.json"),
    "utf8",
  ),
) as unknown;
assert.deepEqual(
  validateVocabularyFixture(validVocabularyFixture),
  [],
  "the complete valid vocabulary fixture must be accepted",
);

const invalidVocabularyFixture = JSON.parse(
  await readFile(
    resolve("packages/contracts/fixtures/vocabulary.invalid.json"),
    "utf8",
  ),
) as unknown;
const invalidVocabularyIssues = validateVocabularyFixture(
  invalidVocabularyFixture,
);
for (const expectedIssue of [
  "generic_taste_forbidden",
  "invalid_basicTaste",
  "invalid_flavorNote",
  "invalid_texture",
  "invalid_heat_value",
  "unknown_richness_must_omit_value",
  "unknown_heatAdjustability_must_omit_value",
  "invalid_ingredientRole",
  "invalid_evidenceBasis",
  "invalid_restaurantResolutionState",
  "invalid_menuSourceType",
  "invalid_menuScope",
  "invalid_menuVersionState",
  "invalid_dishMatchState",
  "invalid_knowledgeOrigin",
  "invalid_knowledgeReviewState",
]) {
  assert(
    invalidVocabularyIssues.includes(expectedIssue),
    `the complete invalid vocabulary fixture must report ${expectedIssue}`,
  );
}
assertOrdered(sharedContracts, "workstream handoffs", [
  "YTW may return only UI-safe candidates",
  "YTW sends structured extraction",
  "Youn sends only validated canonical application data",
  "Juhyung returns only contract-valid constrained explanation output",
  "Youn owns atomic persistence",
  "Juhyung presents the final analysis result",
]);
assert.match(
  agentsGuide,
  /Extracted menu meaning and provenance must pass[\s\S]*Youn-owned canonical validation/,
);
assert.match(
  contractChangeGuide,
  /Server intake, restaurant resolution, source acquisition, compact extraction \| YTW/,
);
assert.match(
  contractChangeGuide,
  /Constrained explanation or user workflow \| Juhyung/,
);
assert.match(
  teamOwnership,
  /YTW \(`ytw010629`\) - upstream intake, restaurant resolution, acquisition, extraction/,
);
assert.match(
  teamOwnership,
  /Youn \(`younjh0923-design`\) - contracts, canonical truth, data, integration/,
);
assert.match(
  teamOwnership,
  /Juhyung \(`juhyungbaek0621`\) - constrained explanation and user experience/,
);
assert.match(
  teamOwnership,
  /The direct YTW-to-Juhyung lane never carries raw provider output/,
);
assert.match(
  codeOwners,
  /\/packages\/source-acquisition\/ @ytw010629 @younjh0923-design/,
);
assert.match(
  codeOwners,
  /\/packages\/menu-analysis\/ @ytw010629 @younjh0923-design @juhyungbaek0621/,
);
for (const path of [
  "database",
  "dish-knowledge",
  "merge-policy",
  "observability",
]) {
  assert.match(
    codeOwners,
    new RegExp(`/packages/${path}/ @younjh0923-design`),
  );
}
assert.match(codeOwners, /\/apps\/web\/ @juhyungbaek0621/);
assert.match(webPackage, /Owner: `juhyungbaek0621`/);
assert.match(sourcePackage, /Owner: `ytw010629`/);
assert.match(restaurantPackage, /Owner: `ytw010629`/);
assertOrdered(menuAnalysisPackage, "menu-analysis ownership", [
  "YTW (`ytw010629`): compact extraction",
  "Youn (`younjh0923-design`): provider-to-canonical normalization",
  "Juhyung (`juhyungbaek0621`): constrained explanation",
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
const ownershipDecision = decisionLog.slice(
  decisionLog.indexOf(
    "## U-008 - Parallel workstreams with guarded semantic handoffs",
  ),
);
assertOrdered(ownershipDecision, "U-008 decision", [
  "YTW owns the upstream server path",
  "Youn owns canonical normalization",
  "Juhyung owns constrained explanation",
  "YTW may send UI-safe candidates",
  "Extracted menu meaning and provenance go to Youn",
  "After U1.6 freezes",
]);
assert.match(
  decisionLog,
  /## U-006 - Canonical validation precedes explanation[\s\S]*\*\*Status:\*\* Accepted/,
);
assert.match(
  decisionLog,
  /## U-007 - Manual PR enforcement[\s\S]*\*\*Status:\*\* Accepted/,
);
assert.match(
  decisionLog,
  /## U-008 - Parallel workstreams with guarded semantic handoffs[\s\S]*PR #4 head[\s\S]*\*\*Status:\*\* Accepted/,
);

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
  "### U1.1 Approve product, evidence, ownership, and trust invariants",
  "DONE",
);
assertTaskStatus(taskMaster, "### U1.2 Freeze shared vocabulary", "DONE");
assertTaskStatus(taskMaster, "### U1.3 Freeze boundary DTOs", "DONE");
assertTaskStatus(
  taskMaster,
  "### U1.4 Freeze environment and feature-flag registry",
  "DONE",
);
assertTaskStatus(taskMaster, "### U1.5 Freeze module interfaces", "DONE");
assertTaskStatus(
  taskMaster,
  "### U1.6 Approve and publish compatibility contract 1.0.0",
  "READY",
);
assertTaskStatus(
  taskMaster,
  "### U2.4 Web and result-experience foundation",
  "BLOCKED",
);
assertTaskStatus(taskMaster, "### U2.5 Continuous integration", "BLOCKED");
const sourceFoundation = markdownTaskSection(
  taskMaster,
  "### U2.2 Source acquisition foundation",
);
assert.match(sourceFoundation, /\*\*Owner:\*\* YTW/);
const webFoundation = markdownTaskSection(
  taskMaster,
  "### U2.4 Web and result-experience foundation",
);
assert.match(webFoundation, /\*\*Owner:\*\* Juhyung/);
for (const heading of [
  "### S1.2 Official menu-source acquisition",
  "### S1.3 OpenAI Web Search menu fallback",
  "### S1.4 Compact menu extraction",
]) {
  assert.match(markdownTaskSection(taskMaster, heading), /\*\*Owner:\*\* YTW/);
}
assert.match(
  markdownTaskSection(taskMaster, "### S1.7 Integrated mobile experience"),
  /\*\*Owner:\*\* Juhyung/,
);
const integratedValidation = markdownTaskSection(
  taskMaster,
  "### S3.1 Integrated adversarial validation",
);
assert.match(
  integratedValidation,
  /\*\*Dependency:\*\* S1\.7, S2\.2, S2\.3/,
);
assert.match(
  integratedValidation,
  /\*\*Blocked by:\*\* S1\.7, S2\.2, and S2\.3/,
);

console.log("Foodseyo shared contract validation passed.");
