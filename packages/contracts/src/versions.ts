export const CONTRACT_STATUS = "frozen" as const;

export const CONTRACT_VERSIONS = {
  sharedVocabulary: "shared-vocabulary/1.0.0",
  menuSource: "menu-source/1.0.0",
  restaurantResolution: "restaurant-resolution/1.1.0",
  compactExtraction: "compact-extraction/1.0.0",
  analysisSnapshot: "analysis-snapshot/1.0.0",
  consistency: "consistency/1.0.0",
  dishKnowledge: "dish-knowledge/1.0.0",
  mergePolicy: "merge-policy/1.0.0",
  explanationRenderer: "explanation-renderer/1.0.0",
  exactCacheKey: "exact-cache-key/1.0.0",
  environmentRegistry: "environment-registry/1.0.0",
  boundaryDtos: "boundary-dtos/1.1.0",
  moduleInterfaces: "module-interfaces/1.0.0",
} as const;

export type ContractName = keyof typeof CONTRACT_VERSIONS;
export type ContractVersion = (typeof CONTRACT_VERSIONS)[ContractName];

export const CANDIDATE_CONTRACT_VERSIONS = {
  webExperience: "web-experience/0.1.0",
} as const;

export type CandidateContractName = keyof typeof CANDIDATE_CONTRACT_VERSIONS;
export type CandidateContractVersion =
  (typeof CANDIDATE_CONTRACT_VERSIONS)[CandidateContractName];
