import {
  FEATURE_FLAG_VALUES,
  RUNTIME_ENVIRONMENTS,
} from "./vocabulary.js";

export const SERVER_ENV_NAMES = {
  runtimeEnvironment: "FOODSEYO_RUNTIME_ENV",
  appBaseUrl: "APP_BASE_URL",
  databaseUrl: "DATABASE_URL",
  openAiApiKey: "OPENAI_API_KEY",
  menuExtractionModel: "OPENAI_MENU_EXTRACTION_MODEL",
  webSearchModel: "OPENAI_WEB_SEARCH_MODEL",
  explanationModel: "OPENAI_EXPLANATION_MODEL",
  googlePlacesApiKey: "GOOGLE_PLACES_API_KEY",
  restaurantResolutionEnabled: "FEATURE_RESTAURANT_RESOLUTION",
  webSearchDiscoveryEnabled: "FEATURE_WEB_SEARCH_DISCOVERY",
  dishKnowledgeReuseEnabled: "FEATURE_DISH_KNOWLEDGE_REUSE",
  logLevel: "LOG_LEVEL",
} as const;

export const OPERATOR_ENV_NAMES = {
  databaseMigrationUrl: "DATABASE_MIGRATION_URL",
} as const;

export const PUBLIC_ENV_NAMES = {} as const;

export type ServerEnvironmentName =
  (typeof SERVER_ENV_NAMES)[keyof typeof SERVER_ENV_NAMES];
export type OperatorEnvironmentName =
  (typeof OPERATOR_ENV_NAMES)[keyof typeof OPERATOR_ENV_NAMES];

export const APPROVED_ENVIRONMENT_NAMES = [
  ...Object.values(SERVER_ENV_NAMES),
  ...Object.values(OPERATOR_ENV_NAMES),
] as const;

export const FEATURE_FLAG_ENV_NAMES = [
  SERVER_ENV_NAMES.restaurantResolutionEnabled,
  SERVER_ENV_NAMES.webSearchDiscoveryEnabled,
  SERVER_ENV_NAMES.dishKnowledgeReuseEnabled,
] as const;

export const LEGACY_ENVIRONMENT_NAMES = [
  "OPENAI_MODEL",
  "OPENAI_DEFAULT_MODEL",
  "OPENAI_VISION_MODEL",
  "OPENAI_MENU_MODEL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];
export type FeatureFlagValue = (typeof FEATURE_FLAG_VALUES)[number];
export type ApprovedEnvironmentName =
  (typeof APPROVED_ENVIRONMENT_NAMES)[number];
export type EnvironmentOwner = "youn" | "ytw" | "juhyung";
export type EnvironmentSecretClass = "secret" | "non_secret";
export type EnvironmentBoundary = "server_runtime" | "operator_only";
export type EnvironmentPolicy =
  | "required"
  | "conditional"
  | "optional"
  | "forbidden";
export type EnvironmentRequirement =
  | "always"
  | "when_application_runs"
  | "when_persistence_enabled"
  | "when_any_openai_stage_enabled"
  | "when_corresponding_openai_stage_enabled"
  | "when_restaurant_resolution_enabled"
  | "optional_operational_control"
  | "operator_migration_command_only";
export type EnvironmentValidationRule =
  | "runtime_environment"
  | "absolute_http_url"
  | "pooled_postgres_url"
  | "non_empty_secret"
  | "non_empty_model_identifier"
  | "boolean_literal"
  | "log_level"
  | "direct_postgres_url";
export type EnvironmentDefaultBehavior = "fail_closed_false" | "info";

export interface EnvironmentVariableContract {
  readonly name: ApprovedEnvironmentName;
  readonly accountableOwner: EnvironmentOwner;
  readonly secretClass: EnvironmentSecretClass;
  readonly boundary: EnvironmentBoundary;
  readonly environmentPolicy: Readonly<
    Record<RuntimeEnvironment, EnvironmentPolicy>
  >;
  readonly requirement: EnvironmentRequirement;
  readonly validationRule: EnvironmentValidationRule;
  readonly defaultBehavior?: EnvironmentDefaultBehavior;
  readonly neverLogValue: true;
}

const applicationPolicy = {
  development: "required",
  preview: "required",
  production: "required",
  test: "optional",
} as const;

const conditionalNetworkPolicy = {
  development: "conditional",
  preview: "conditional",
  production: "conditional",
  test: "forbidden",
} as const;

const optionalPolicy = {
  development: "optional",
  preview: "optional",
  production: "optional",
  test: "optional",
} as const;

const runtimeEnvironmentPolicy = {
  development: "required",
  preview: "required",
  production: "required",
  test: "required",
} as const;

export const ENVIRONMENT_REGISTRY = {
  [SERVER_ENV_NAMES.runtimeEnvironment]: {
    name: SERVER_ENV_NAMES.runtimeEnvironment,
    accountableOwner: "youn",
    secretClass: "non_secret",
    boundary: "server_runtime",
    environmentPolicy: runtimeEnvironmentPolicy,
    requirement: "always",
    validationRule: "runtime_environment",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.appBaseUrl]: {
    name: SERVER_ENV_NAMES.appBaseUrl,
    accountableOwner: "juhyung",
    secretClass: "non_secret",
    boundary: "server_runtime",
    environmentPolicy: applicationPolicy,
    requirement: "when_application_runs",
    validationRule: "absolute_http_url",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.databaseUrl]: {
    name: SERVER_ENV_NAMES.databaseUrl,
    accountableOwner: "youn",
    secretClass: "secret",
    boundary: "server_runtime",
    environmentPolicy: conditionalNetworkPolicy,
    requirement: "when_persistence_enabled",
    validationRule: "pooled_postgres_url",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.openAiApiKey]: {
    name: SERVER_ENV_NAMES.openAiApiKey,
    accountableOwner: "youn",
    secretClass: "secret",
    boundary: "server_runtime",
    environmentPolicy: conditionalNetworkPolicy,
    requirement: "when_any_openai_stage_enabled",
    validationRule: "non_empty_secret",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.menuExtractionModel]: {
    name: SERVER_ENV_NAMES.menuExtractionModel,
    accountableOwner: "ytw",
    secretClass: "non_secret",
    boundary: "server_runtime",
    environmentPolicy: conditionalNetworkPolicy,
    requirement: "when_corresponding_openai_stage_enabled",
    validationRule: "non_empty_model_identifier",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.webSearchModel]: {
    name: SERVER_ENV_NAMES.webSearchModel,
    accountableOwner: "ytw",
    secretClass: "non_secret",
    boundary: "server_runtime",
    environmentPolicy: conditionalNetworkPolicy,
    requirement: "when_corresponding_openai_stage_enabled",
    validationRule: "non_empty_model_identifier",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.explanationModel]: {
    name: SERVER_ENV_NAMES.explanationModel,
    accountableOwner: "juhyung",
    secretClass: "non_secret",
    boundary: "server_runtime",
    environmentPolicy: conditionalNetworkPolicy,
    requirement: "when_corresponding_openai_stage_enabled",
    validationRule: "non_empty_model_identifier",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.googlePlacesApiKey]: {
    name: SERVER_ENV_NAMES.googlePlacesApiKey,
    accountableOwner: "ytw",
    secretClass: "secret",
    boundary: "server_runtime",
    environmentPolicy: conditionalNetworkPolicy,
    requirement: "when_restaurant_resolution_enabled",
    validationRule: "non_empty_secret",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.restaurantResolutionEnabled]: {
    name: SERVER_ENV_NAMES.restaurantResolutionEnabled,
    accountableOwner: "ytw",
    secretClass: "non_secret",
    boundary: "server_runtime",
    environmentPolicy: optionalPolicy,
    requirement: "optional_operational_control",
    validationRule: "boolean_literal",
    defaultBehavior: "fail_closed_false",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.webSearchDiscoveryEnabled]: {
    name: SERVER_ENV_NAMES.webSearchDiscoveryEnabled,
    accountableOwner: "ytw",
    secretClass: "non_secret",
    boundary: "server_runtime",
    environmentPolicy: optionalPolicy,
    requirement: "optional_operational_control",
    validationRule: "boolean_literal",
    defaultBehavior: "fail_closed_false",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.dishKnowledgeReuseEnabled]: {
    name: SERVER_ENV_NAMES.dishKnowledgeReuseEnabled,
    accountableOwner: "youn",
    secretClass: "non_secret",
    boundary: "server_runtime",
    environmentPolicy: optionalPolicy,
    requirement: "optional_operational_control",
    validationRule: "boolean_literal",
    defaultBehavior: "fail_closed_false",
    neverLogValue: true,
  },
  [SERVER_ENV_NAMES.logLevel]: {
    name: SERVER_ENV_NAMES.logLevel,
    accountableOwner: "youn",
    secretClass: "non_secret",
    boundary: "server_runtime",
    environmentPolicy: optionalPolicy,
    requirement: "optional_operational_control",
    validationRule: "log_level",
    defaultBehavior: "info",
    neverLogValue: true,
  },
  [OPERATOR_ENV_NAMES.databaseMigrationUrl]: {
    name: OPERATOR_ENV_NAMES.databaseMigrationUrl,
    accountableOwner: "youn",
    secretClass: "secret",
    boundary: "operator_only",
    environmentPolicy: conditionalNetworkPolicy,
    requirement: "operator_migration_command_only",
    validationRule: "direct_postgres_url",
    neverLogValue: true,
  },
} as const satisfies Readonly<
  Record<ApprovedEnvironmentName, EnvironmentVariableContract>
>;

const approvedEnvironmentNameSet = new Set<string>(
  APPROVED_ENVIRONMENT_NAMES,
);
const legacyEnvironmentNameSet = new Set<string>(LEGACY_ENVIRONMENT_NAMES);

export const isApprovedEnvironmentName = (
  name: string,
): name is ApprovedEnvironmentName => approvedEnvironmentNameSet.has(name);

export const isProhibitedEnvironmentName = (name: string): boolean =>
  name.startsWith("NEXT_PUBLIC_") ||
  name.startsWith("SUPABASE_") ||
  legacyEnvironmentNameSet.has(name);

export const parseFeatureFlag = (value: string | undefined): boolean =>
  value === "true";
