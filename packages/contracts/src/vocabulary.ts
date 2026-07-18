export const BASIC_TASTES = [
  "sweet",
  "salty",
  "sour",
  "bitter",
  "savory",
] as const;

export const FLAVOR_NOTES = [
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
] as const;

export const TEXTURES = [
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
] as const;

export const HEAT_LEVELS = [
  "none",
  "mild",
  "medium",
  "hot",
  "very_hot",
  "unknown",
] as const;

export const RICHNESS_LEVELS = [
  "light",
  "moderate",
  "rich",
  "unknown",
] as const;

export const INGREDIENT_ROLES = [
  "core",
  "typical",
  "optional",
  "regional_variant",
  "preparation_dependent",
] as const;

export const EVIDENCE_BASES = [
  "source_stated",
  "inferred_from_source",
  "culinary_baseline",
  "unknown",
] as const;

export const RESTAURANT_RESOLUTION_STATES = [
  "candidate",
  "user_confirmed",
  "externally_verified",
  "rejected",
  "conflicting",
] as const;

export const MENU_SOURCE_TYPES = [
  "uploaded_menu",
  "official_website",
  "official_pdf",
  "ordering_page",
  "web_search_discovery",
] as const;

export const MENU_SCOPES = [
  "breakfast",
  "lunch",
  "dinner",
  "drinks",
  "happy_hour",
  "seasonal",
  "default",
] as const;

export const MENU_VERSION_STATES = [
  "draft",
  "active",
  "stale",
  "superseded",
  "retired",
] as const;

export const DISH_MATCH_STATES = [
  "candidate",
  "matched",
  "reviewed",
  "rejected",
  "unresolved",
] as const;

export const KNOWLEDGE_REVIEW_STATES = [
  "model_generated",
  "unreviewed",
  "reviewed",
  "superseded",
  "retired",
] as const;

export const RUNTIME_ENVIRONMENTS = [
  "development",
  "preview",
  "production",
  "test",
] as const;

export const FEATURE_FLAG_VALUES = ["true", "false"] as const;

export type BasicTaste = (typeof BASIC_TASTES)[number];
export type FlavorNote = (typeof FLAVOR_NOTES)[number];
export type Texture = (typeof TEXTURES)[number];
export type HeatLevel = (typeof HEAT_LEVELS)[number];
export type RichnessLevel = (typeof RICHNESS_LEVELS)[number];
export type IngredientRole = (typeof INGREDIENT_ROLES)[number];
export type EvidenceBasis = (typeof EVIDENCE_BASES)[number];
