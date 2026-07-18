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
