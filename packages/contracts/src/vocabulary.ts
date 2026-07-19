export interface ControlledDescriptorDefinition {
  readonly definition: string;
  readonly aliases: readonly string[];
}

export const SENSORY_AXES = [
  "basic_taste",
  "flavor_note",
  "texture",
  "heat",
  "richness",
] as const;

export const BASIC_TASTES = [
  "sweet",
  "salty",
  "sour",
  "bitter",
  "umami",
] as const;

export type BasicTaste = (typeof BASIC_TASTES)[number];

export const BASIC_TASTE_ALIASES = {
  savory: "umami",
  savoury: "umami",
} as const satisfies Readonly<Record<string, BasicTaste>>;

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

export type FlavorNote = (typeof FLAVOR_NOTES)[number];

export const FLAVOR_NOTE_DEFINITIONS = {
  smoky: {
    definition: "A smoke-like aroma or flavor impression.",
    aliases: ["smoked", "smoke-like"],
  },
  herbal: {
    definition: "An aroma impression associated with fresh or dried herbs.",
    aliases: ["herbaceous", "herb-like"],
  },
  nutty: {
    definition:
      "A roasted-nut-like aroma or flavor impression; it is not evidence that nuts are present.",
    aliases: ["nut-like", "roasted-nut-like"],
  },
  earthy: {
    definition: "A soil-like, root-like, or forest-floor aroma impression.",
    aliases: ["earth-like", "soil-like"],
  },
  garlicky: {
    definition: "A garlic-like aroma or flavor impression.",
    aliases: ["garlic-forward", "garlic-like"],
  },
  buttery: {
    definition:
      "A butter-like aroma, flavor, or coating impression; it is not evidence that dairy is present.",
    aliases: ["butter-like", "buttery-tasting"],
  },
  cheesy: {
    definition:
      "A cheese-like aroma or flavor impression; it is not evidence that dairy is present.",
    aliases: ["cheese-like", "cheesy-tasting"],
  },
  fruity: {
    definition: "A non-citrus fruit-like aroma or flavor impression.",
    aliases: ["fruit-forward", "fruit-like"],
  },
  citrusy: {
    definition: "A citrus-peel, citrus-juice, or citrus-like aroma impression.",
    aliases: ["citrus-forward", "citrus-like"],
  },
  fermented: {
    definition:
      "An aroma or flavor impression associated with fermentation; it does not identify a specific ingredient or process by itself.",
    aliases: ["fermentative", "fermented-tasting"],
  },
} as const satisfies Readonly<
  Record<FlavorNote, ControlledDescriptorDefinition>
>;

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

export type Texture = (typeof TEXTURES)[number];

export const TEXTURE_DEFINITIONS = {
  crispy: {
    definition:
      "A thin or dry structure that fractures readily, often at a surface.",
    aliases: ["crisp", "crackly"],
  },
  crunchy: {
    definition:
      "A firm structure that breaks with repeated, clearly perceptible fracture.",
    aliases: ["crunch", "hard-crisp"],
  },
  creamy: {
    definition:
      "A smooth, cohesive, cream-like mouthfeel; it is not evidence that dairy is present.",
    aliases: ["cream-like", "smooth-creamy"],
  },
  tender: {
    definition: "A structure that yields with relatively little biting force.",
    aliases: ["easy-to-bite", "fork-tender"],
  },
  chewy: {
    definition: "A resilient structure that requires repeated chewing.",
    aliases: ["chewiness", "resilient-chew"],
  },
  juicy: {
    definition: "A structure that releases noticeable liquid during eating.",
    aliases: ["juice-releasing", "succulent"],
  },
  flaky: {
    definition: "A layered structure that separates into thin pieces or flakes.",
    aliases: ["layered-flaky", "flakes-apart"],
  },
  soft: {
    definition: "A structure that deforms easily under light force.",
    aliases: ["soft-textured", "easily-deformed"],
  },
  firm: {
    definition:
      "A structure that resists deformation without necessarily being hard or crunchy.",
    aliases: ["firm-textured", "holds-shape"],
  },
  dense: {
    definition:
      "A compact structure with relatively little perceived internal air space.",
    aliases: ["compact", "heavy-textured"],
  },
  airy: {
    definition:
      "A light structure with readily perceived internal air space or bubbles.",
    aliases: ["aerated", "light-and-airy"],
  },
  silky: {
    definition:
      "An exceptionally smooth, fine, low-grain mouthfeel during movement.",
    aliases: ["silken", "silky-smooth"],
  },
  sticky: {
    definition:
      "A structure that noticeably adheres to itself or oral surfaces.",
    aliases: ["adhesive", "tacky"],
  },
  springy: {
    definition:
      "An elastic structure that noticeably returns toward its original shape.",
    aliases: ["bouncy", "elastic"],
  },
  crumbly: {
    definition:
      "A structure that readily breaks into many small, separate pieces.",
    aliases: ["crumbles", "friable"],
  },
  moist: {
    definition:
      "A structure with noticeable retained moisture without necessarily releasing liquid.",
    aliases: ["moist-textured", "damp"],
  },
} as const satisfies Readonly<Record<Texture, ControlledDescriptorDefinition>>;

export const HEAT_LEVELS = [
  "none",
  "mild",
  "medium",
  "hot",
  "very_hot",
] as const;

export type HeatLevel = (typeof HEAT_LEVELS)[number];

export const HEAT_LEVEL_DEFINITIONS = {
  none: "No perceptible pungent or burning heat is expected from the available evidence.",
  mild: "Pungent heat is gentle and not expected to dominate the eating experience.",
  medium: "Pungent heat is clearly perceptible but shares attention with other attributes.",
  hot: "Pungent heat is strong and prominent.",
  very_hot: "Pungent heat is expected to dominate the eating experience for many users.",
} as const satisfies Readonly<Record<HeatLevel, string>>;

export const RICHNESS_LEVELS = ["light", "moderate", "rich"] as const;

export type RichnessLevel = (typeof RICHNESS_LEVELS)[number];

export const RICHNESS_LEVEL_DEFINITIONS = {
  light:
    "A relatively low perceived weight, coating, density, or concentration based on explicit evidence.",
  moderate:
    "A middle level of perceived weight, coating, density, or concentration based on explicit evidence.",
  rich:
    "A pronounced perceived weight, coating, density, or concentration based on explicit evidence.",
} as const satisfies Readonly<Record<RichnessLevel, string>>;

export const SENSORY_VALUE_STATES = ["known", "unknown"] as const;

export const HEAT_ADJUSTABILITY_STATES = [
  "fixed",
  "user_selectable",
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
  "rejected",
  "unresolved",
] as const;

export const KNOWLEDGE_ORIGIN_KINDS = [
  "model_generated",
  "human_authored",
  "imported",
] as const;

export const KNOWLEDGE_REVIEW_STATES = [
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

export type SensoryAxis = (typeof SENSORY_AXES)[number];
export type SensoryValueState = (typeof SENSORY_VALUE_STATES)[number];
export type HeatAdjustabilityState =
  (typeof HEAT_ADJUSTABILITY_STATES)[number];
export type IngredientRole = (typeof INGREDIENT_ROLES)[number];
export type EvidenceBasis = (typeof EVIDENCE_BASES)[number];
export type RestaurantResolutionState =
  (typeof RESTAURANT_RESOLUTION_STATES)[number];
export type MenuSourceType = (typeof MENU_SOURCE_TYPES)[number];
export type MenuScope = (typeof MENU_SCOPES)[number];
export type MenuVersionState = (typeof MENU_VERSION_STATES)[number];
export type DishMatchState = (typeof DISH_MATCH_STATES)[number];
export type KnowledgeOriginKind = (typeof KNOWLEDGE_ORIGIN_KINDS)[number];
export type KnowledgeReviewState =
  (typeof KNOWLEDGE_REVIEW_STATES)[number];
