export const CONTRACT_STATUS = "draft" as const;

export const CONTRACT_VERSIONS = {
  menuSource: "menu-source/0.1.0",
  restaurantResolution: "restaurant-resolution/0.1.0",
  compactExtraction: "compact-extraction/0.1.0",
  analysisSnapshot: "analysis-snapshot/0.1.0",
  consistency: "consistency/0.1.0",
  dishKnowledge: "dish-knowledge/0.1.0",
  mergePolicy: "merge-policy/0.1.0",
  explanationRenderer: "explanation-renderer/0.1.0",
  exactCacheKey: "exact-cache-key/0.1.0",
} as const;

export type ContractName = keyof typeof CONTRACT_VERSIONS;
export type ContractVersion = (typeof CONTRACT_VERSIONS)[ContractName];
