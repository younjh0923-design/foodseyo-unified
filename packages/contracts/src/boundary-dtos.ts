import {
  BASIC_TASTES,
  DISH_MATCH_STATES,
  EVIDENCE_BASES,
  FLAVOR_NOTES,
  HEAT_ADJUSTABILITY_STATES,
  HEAT_LEVELS,
  INGREDIENT_ROLES,
  KNOWLEDGE_ORIGIN_KINDS,
  KNOWLEDGE_REVIEW_STATES,
  MENU_SCOPES,
  MENU_SOURCE_TYPES,
  MENU_VERSION_STATES,
  RESTAURANT_RESOLUTION_STATES,
  RICHNESS_LEVELS,
  TEXTURES,
  type BasicTaste,
  type DishMatchState,
  type EvidenceBasis,
  type FlavorNote,
  type HeatAdjustabilityState,
  type HeatLevel,
  type IngredientRole,
  type KnowledgeOriginKind,
  type KnowledgeReviewState,
  type MenuScope,
  type MenuSourceType,
  type MenuVersionState,
  type RestaurantResolutionState,
  type RichnessLevel,
  type Texture,
} from "./vocabulary.js";
import {
  CONTRACT_VERSIONS,
  type ContractVersion,
} from "./versions.js";
import {
  addContractIssue,
  createRuntimeSchema,
  isContractRecord,
  validateArray,
  validateBoolean,
  validateEnumValue,
  validateFiniteNumber,
  validateInteger,
  validateLiteral,
  validateNullableString,
  validateRecord,
  validateString,
  validateUniqueStrings,
  type ContractPathSegment,
  type ContractValidationIssue,
} from "./runtime-schema.js";

export const RESTAURANT_MATCH_SIGNALS = [
  "name",
  "address",
  "location",
  "user_link",
  "visual_text",
] as const;

export const MENU_CONTENT_KINDS = [
  "image_collection",
  "html",
  "pdf",
  "plain_text",
] as const;

export const EXTRACTION_WARNING_CODES = [
  "partial_menu",
  "uncertain_section",
  "uncertain_price",
  "unreadable_content",
] as const;

export const MATCH_DECISION_KINDS = [
  "human_reviewed",
  "deterministic_rule",
] as const;

export const CULINARY_CLAIM_KINDS = [
  "basic_tastes",
  "flavor_notes",
  "textures",
  "heat",
  "richness",
  "heat_adjustability",
  "ingredient",
] as const;

export const PUBLIC_OUTCOME_CODES = [
  "RESTAURANT_CONFIRMATION_REQUIRED",
  "RESTAURANT_NOT_RESOLVED",
  "MENU_SOURCE_NOT_FOUND",
  "MENU_SOURCE_CONFLICT",
  "MENU_PARTIAL",
] as const;

export const WORKFLOW_STAGES = [
  "intake",
  "restaurant_resolution",
  "source_acquisition",
  "compact_extraction",
  "canonical_validation",
  "constrained_explanation",
  "persistence",
] as const;

export const PUBLIC_ERROR_CODES = [
  "INVALID_INPUT",
  "UNSAFE_SOURCE",
  "PAYLOAD_TOO_LARGE",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
  "INVALID_UPSTREAM_RESULT",
  "ANALYSIS_TEMPORARILY_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type RestaurantMatchSignal =
  (typeof RESTAURANT_MATCH_SIGNALS)[number];
export type MenuContentKind = (typeof MENU_CONTENT_KINDS)[number];
export type ExtractionWarningCode =
  (typeof EXTRACTION_WARNING_CODES)[number];
export type MatchDecisionKind = (typeof MATCH_DECISION_KINDS)[number];
export type CulinaryClaimKind = (typeof CULINARY_CLAIM_KINDS)[number];
export type PublicOutcomeCode = (typeof PUBLIC_OUTCOME_CODES)[number];
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
export type PublicErrorCode = (typeof PUBLIC_ERROR_CODES)[number];

export interface SafeSourceReference {
  readonly sourceRef: string;
  readonly sourceType: MenuSourceType;
  readonly sourceFingerprint: string;
  readonly collectedAt: string;
}

export interface MenuSourceEvidence {
  readonly kind: "menu_source";
  readonly sourceRef: string;
  readonly sourceIndexes: readonly number[];
}

export interface KnowledgeSourceEvidence {
  readonly kind: "knowledge_source";
  readonly sourceRef: string;
  readonly sourceLabel: string;
}

export type ProvenanceReference =
  | MenuSourceEvidence
  | KnowledgeSourceEvidence;

export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface RestaurantCandidate {
  readonly contractVersion: ContractVersion;
  readonly candidateId: string;
  readonly googlePlaceId: string;
  readonly displayName: string;
  readonly fullAddress: string | null;
  readonly shortAddress: string | null;
  readonly location: GeoPoint | null;
  readonly matchSignals: readonly RestaurantMatchSignal[];
  readonly rank: number;
}

export type RestaurantConfirmationEvidence =
  | {
      readonly kind: "user_action";
      readonly actionRef: string;
      readonly recordedAt: string;
    }
  | {
      readonly kind: "external_evidence";
      readonly sourceRefs: readonly string[];
      readonly recordedAt: string;
    };

export interface RestaurantResolution {
  readonly contractVersion: ContractVersion;
  readonly state: RestaurantResolutionState;
  readonly candidates: readonly RestaurantCandidate[];
  readonly selectedCandidateId: string | null;
  readonly restaurantId: string | null;
  readonly confirmationEvidence: RestaurantConfirmationEvidence | null;
  readonly requiresUserConfirmation: boolean;
  readonly canContinueMenuOnly: true;
  readonly resolvedAt: string | null;
}

export interface ConfirmedRestaurantContext {
  readonly restaurantId: string | null;
  readonly candidateId: string;
  readonly googlePlaceId: string;
  readonly resolutionState: "user_confirmed" | "externally_verified";
}

export interface TransientMenuContent {
  readonly kind: MenuContentKind;
  readonly contentHandle: string;
  readonly sensitivity: "sensitive_transient";
  readonly byteCount: number | null;
  readonly pageCount: number | null;
}

export interface MenuSourceInput {
  readonly contractVersion: ContractVersion;
  readonly source: SafeSourceReference;
  readonly restaurantContext: ConfirmedRestaurantContext | null;
  readonly menuScope: MenuScope;
  readonly content: TransientMenuContent;
  readonly requestedAt: string;
}

export interface ExtractedMenuItem {
  readonly itemIndex: number;
  readonly name: string;
  readonly description: string | null;
  readonly price: Money | null;
  readonly optionTexts: readonly string[];
  readonly sourceEvidence: readonly MenuSourceEvidence[];
}

export interface ExtractedMenuSection {
  readonly sectionIndex: number;
  readonly name: string | null;
  readonly items: readonly ExtractedMenuItem[];
}

export interface CompactMenuExtraction {
  readonly contractVersion: ContractVersion;
  readonly extractionState: "unvalidated";
  readonly source: SafeSourceReference;
  readonly restaurantContext: ConfirmedRestaurantContext | null;
  readonly menuScope: MenuScope;
  readonly sections: readonly ExtractedMenuSection[];
  readonly warningCodes: readonly ExtractionWarningCode[];
  readonly completedAt: string;
}

export interface RestaurantMenuVersion {
  readonly menuVersionId: string;
  readonly restaurantId: string;
  readonly menuScope: MenuScope;
  readonly state: MenuVersionState;
  readonly versionOrdinal: number;
  readonly sourceRefs: readonly string[];
  readonly collectedAt: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly supersedesMenuVersionId: string | null;
}

export interface MenuItem {
  readonly menuItemId: string;
  readonly menuVersionId: string | null;
  readonly sectionIndex: number;
  readonly itemIndex: number;
  readonly name: string;
  readonly description: string | null;
  readonly price: Money | null;
  readonly optionTexts: readonly string[];
  readonly sourceEvidence: readonly MenuSourceEvidence[];
}

export interface DishCandidate {
  readonly contractVersion: ContractVersion;
  readonly candidateId: string;
  readonly dishId: string | null;
  readonly displayName: string;
  readonly normalizedName: string;
  readonly aliases: readonly string[];
  readonly sourceEvidence: readonly MenuSourceEvidence[];
}

export type MatchDecision =
  | {
      readonly kind: "human_reviewed";
      readonly reviewerRef: string;
      readonly ruleVersion: null;
      readonly decidedAt: string;
    }
  | {
      readonly kind: "deterministic_rule";
      readonly reviewerRef: null;
      readonly ruleVersion: string;
      readonly decidedAt: string;
    };

export interface MenuItemDishMatch {
  readonly matchId: string;
  readonly menuItemId: string;
  readonly dishCandidateId: string;
  readonly dishId: string | null;
  readonly state: DishMatchState;
  readonly decision: MatchDecision | null;
  readonly sourceEvidence: readonly MenuSourceEvidence[];
}

export type CulinaryClaimValue =
  | {
      readonly kind: "basic_tastes";
      readonly values: readonly BasicTaste[];
    }
  | {
      readonly kind: "flavor_notes";
      readonly values: readonly FlavorNote[];
    }
  | {
      readonly kind: "textures";
      readonly values: readonly Texture[];
    }
  | {
      readonly kind: "heat";
      readonly value: HeatLevel;
    }
  | {
      readonly kind: "richness";
      readonly value: RichnessLevel;
    }
  | {
      readonly kind: "heat_adjustability";
      readonly value: HeatAdjustabilityState;
    }
  | {
      readonly kind: "ingredient";
      readonly ingredientRef: string | null;
      readonly ingredientName: string;
      readonly role: IngredientRole;
    };

export interface MenuItemClaim {
  readonly claimId: string;
  readonly menuItemId: string;
  readonly claim: CulinaryClaimValue;
  readonly basis: "source_stated" | "inferred_from_source";
  readonly provenance: readonly MenuSourceEvidence[];
  readonly recordedAt: string;
}

export interface DishClaim {
  readonly claimId: string;
  readonly dishId: string;
  readonly claim: CulinaryClaimValue;
  readonly basis: "culinary_baseline";
  readonly originKind: KnowledgeOriginKind;
  readonly reviewState: KnowledgeReviewState;
  readonly profileVersion: string;
  readonly provenance: readonly KnowledgeSourceEvidence[];
  readonly recordedAt: string;
  readonly reviewedAt: string | null;
  readonly supersedesClaimId: string | null;
}

export type EffectiveField<T> =
  | {
      readonly state: "known";
      readonly value: T;
      readonly basis: Exclude<EvidenceBasis, "unknown">;
      readonly claimIds: readonly string[];
      readonly provenance: readonly ProvenanceReference[];
    }
  | {
      readonly state: "unknown";
      readonly basis: "unknown";
      readonly claimIds: readonly [];
      readonly provenance: readonly [];
    };

export interface EffectiveDishProfile {
  readonly contractVersion: ContractVersion;
  readonly kind: "derived";
  readonly menuItemId: string;
  readonly dishId: string;
  readonly matchId: string;
  readonly mergePolicyVersion: ContractVersion;
  readonly dishKnowledgeVersion: ContractVersion;
  readonly inputClaimIds: readonly string[];
  readonly fields: {
    readonly basicTastes: EffectiveField<readonly BasicTaste[]>;
    readonly flavorNotes: EffectiveField<readonly FlavorNote[]>;
    readonly textures: EffectiveField<readonly Texture[]>;
    readonly heat: EffectiveField<HeatLevel>;
    readonly richness: EffectiveField<RichnessLevel>;
    readonly heatAdjustability: EffectiveField<HeatAdjustabilityState>;
    readonly ingredients: EffectiveField<
      readonly {
        readonly ingredientRef: string | null;
        readonly ingredientName: string;
        readonly role: IngredientRole;
      }[]
    >;
  };
  readonly derivedAt: string;
}

export const CANONICAL_PUBLICATION_STATES = [
  "eligible",
  "analysis_only",
] as const;

export type CanonicalPublicationState =
  (typeof CANONICAL_PUBLICATION_STATES)[number];

export interface CanonicalMenuAnalysis {
  readonly contractVersion: ContractVersion;
  readonly analysisId: string;
  readonly source: SafeSourceReference;
  readonly restaurantResolution: RestaurantResolution;
  readonly publicationState: CanonicalPublicationState;
  readonly menuVersion: RestaurantMenuVersion | null;
  readonly menuItems: readonly MenuItem[];
  readonly dishCandidates: readonly DishCandidate[];
  readonly dishMatches: readonly MenuItemDishMatch[];
  readonly menuItemClaims: readonly MenuItemClaim[];
  readonly dishClaims: readonly DishClaim[];
  readonly effectiveProfiles: readonly EffectiveDishProfile[];
  readonly warningCodes: readonly ExtractionWarningCode[];
  readonly validatedAt: string;
}

export interface PublicOutcome {
  readonly code: PublicOutcomeCode;
  readonly stage: WorkflowStage;
  readonly correlationId: string;
  readonly retryable: boolean;
  readonly canContinueMenuOnly: boolean;
}

export interface PublicErrorDefinition {
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly message: string;
}

export const PUBLIC_ERROR_REGISTRY = {
  INVALID_INPUT: {
    httpStatus: 400,
    retryable: false,
    message: "The request could not be processed.",
  },
  UNSAFE_SOURCE: {
    httpStatus: 400,
    retryable: false,
    message: "The supplied source could not be used safely.",
  },
  PAYLOAD_TOO_LARGE: {
    httpStatus: 413,
    retryable: false,
    message: "The supplied menu input is too large.",
  },
  UPSTREAM_TIMEOUT: {
    httpStatus: 504,
    retryable: true,
    message: "The menu source took too long to respond.",
  },
  UPSTREAM_UNAVAILABLE: {
    httpStatus: 503,
    retryable: true,
    message: "A required menu service is temporarily unavailable.",
  },
  INVALID_UPSTREAM_RESULT: {
    httpStatus: 502,
    retryable: true,
    message: "The menu result could not be validated.",
  },
  ANALYSIS_TEMPORARILY_UNAVAILABLE: {
    httpStatus: 503,
    retryable: true,
    message: "Menu analysis is temporarily unavailable.",
  },
  INTERNAL_ERROR: {
    httpStatus: 500,
    retryable: true,
    message: "Menu analysis could not be completed.",
  },
} as const satisfies Readonly<Record<PublicErrorCode, PublicErrorDefinition>>;

export interface PublicErrorEnvelope {
  readonly error: {
    readonly code: PublicErrorCode;
    readonly message: string;
    readonly correlationId: string;
    readonly retryable: boolean;
  };
  readonly httpStatus: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

const validateUuid = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => validateString(value, issues, path, { pattern: UUID_PATTERN });

const validateUtcTimestamp = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    validateString(value, issues, path, { minLength: 20, maxLength: 35 }) &&
    (!value.endsWith("Z") || Number.isNaN(Date.parse(value)))
  ) {
    addContractIssue(issues, "expected_utc_iso_timestamp", path);
  }
};

const validateVersion = (
  value: unknown,
  expected: ContractVersion,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => validateLiteral(value, expected, issues, path);

const validateSafeToken = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) =>
  validateString(value, issues, path, {
    minLength: 8,
    maxLength: 256,
    pattern: SAFE_TOKEN_PATTERN,
  });

const validateMoney = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (!validateRecord(value, ["amountMinor", "currency"], [], issues, path)) {
    return;
  }
  validateInteger(value.amountMinor, issues, [...path, "amountMinor"], {
    minimum: 0,
  });
  validateString(value.currency, issues, [...path, "currency"], {
    pattern: CURRENCY_PATTERN,
  });
};

const validateNullableMoney = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (value !== null) {
    validateMoney(value, issues, path);
  }
};

const validateGeoPoint = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (!validateRecord(value, ["latitude", "longitude"], [], issues, path)) {
    return;
  }
  validateFiniteNumber(value.latitude, issues, [...path, "latitude"], {
    minimum: -90,
    maximum: 90,
  });
  validateFiniteNumber(value.longitude, issues, [...path, "longitude"], {
    minimum: -180,
    maximum: 180,
  });
};

const validateNullableGeoPoint = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (value !== null) {
    validateGeoPoint(value, issues, path);
  }
};

const validateUniqueRecordField = (
  records: readonly Readonly<Record<string, unknown>>[],
  field: string,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  const seen = new Set<unknown>();
  records.forEach((record, index) => {
    const value = record[field];
    if (seen.has(value)) {
      addContractIssue(issues, "duplicate_identity", [...path, index, field]);
    }
    seen.add(value);
  });
};

const validateSafeSourceReference = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      ["sourceRef", "sourceType", "sourceFingerprint", "collectedAt"],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateUuid(value.sourceRef, issues, [...path, "sourceRef"]);
  validateEnumValue(
    value.sourceType,
    MENU_SOURCE_TYPES,
    issues,
    [...path, "sourceType"],
  );
  validateSafeToken(value.sourceFingerprint, issues, [
    ...path,
    "sourceFingerprint",
  ]);
  validateUtcTimestamp(value.collectedAt, issues, [...path, "collectedAt"]);
};

const validateMenuSourceEvidence = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      ["kind", "sourceRef", "sourceIndexes"],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateLiteral(value.kind, "menu_source", issues, [...path, "kind"]);
  validateUuid(value.sourceRef, issues, [...path, "sourceRef"]);
  validateArray(
    value.sourceIndexes,
    issues,
    [...path, "sourceIndexes"],
    (item, itemIssues, itemPath) => {
      validateInteger(item, itemIssues, itemPath, { minimum: 0 });
    },
    { minLength: 1, maxLength: 128 },
  );
  if (Array.isArray(value.sourceIndexes)) {
    const indexes = value.sourceIndexes.filter(
      (item): item is number => typeof item === "number",
    );
    if (new Set(indexes).size !== indexes.length) {
      addContractIssue(issues, "duplicate_source_index", [
        ...path,
        "sourceIndexes",
      ]);
    }
  }
};

const validateKnowledgeSourceEvidence = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      ["kind", "sourceRef", "sourceLabel"],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateLiteral(value.kind, "knowledge_source", issues, [...path, "kind"]);
  validateUuid(value.sourceRef, issues, [...path, "sourceRef"]);
  validateString(value.sourceLabel, issues, [...path, "sourceLabel"], {
    minLength: 1,
    maxLength: 160,
  });
  if (
    typeof value.sourceLabel === "string" &&
    /(?:https?|file):\/\//i.test(value.sourceLabel)
  ) {
    addContractIssue(issues, "raw_source_url_forbidden", [
      ...path,
      "sourceLabel",
    ]);
  }
};

const validateProvenanceReference = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (!isContractRecord(value)) {
    addContractIssue(issues, "expected_object", path);
    return;
  }
  if (value.kind === "menu_source") {
    validateMenuSourceEvidence(value, issues, path);
    return;
  }
  if (value.kind === "knowledge_source") {
    validateKnowledgeSourceEvidence(value, issues, path);
    return;
  }
  addContractIssue(issues, "invalid_provenance_kind", [...path, "kind"]);
};

const validateRestaurantCandidate = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
) => {
  if (
    !validateRecord(
      value,
      [
        "contractVersion",
        "candidateId",
        "googlePlaceId",
        "displayName",
        "fullAddress",
        "shortAddress",
        "location",
        "matchSignals",
        "rank",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateVersion(
    value.contractVersion,
    CONTRACT_VERSIONS.restaurantResolution,
    issues,
    [...path, "contractVersion"],
  );
  validateUuid(value.candidateId, issues, [...path, "candidateId"]);
  validateString(value.googlePlaceId, issues, [...path, "googlePlaceId"], {
    minLength: 5,
    maxLength: 256,
  });
  validateString(value.displayName, issues, [...path, "displayName"], {
    minLength: 1,
    maxLength: 200,
  });
  validateNullableString(value.fullAddress, issues, [...path, "fullAddress"], {
    minLength: 1,
    maxLength: 400,
  });
  validateNullableString(value.shortAddress, issues, [...path, "shortAddress"], {
    minLength: 1,
    maxLength: 200,
  });
  validateNullableGeoPoint(value.location, issues, [...path, "location"]);
  validateArray(
    value.matchSignals,
    issues,
    [...path, "matchSignals"],
    (item, itemIssues, itemPath) => {
      validateEnumValue(item, RESTAURANT_MATCH_SIGNALS, itemIssues, itemPath);
    },
    { minLength: 1, maxLength: RESTAURANT_MATCH_SIGNALS.length },
  );
  validateUniqueStrings(value.matchSignals, issues, [...path, "matchSignals"]);
  validateInteger(value.rank, issues, [...path, "rank"], { minimum: 1 });
};

const validateConfirmationEvidence = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (!isContractRecord(value)) {
    addContractIssue(issues, "expected_object", path);
    return;
  }
  if (value.kind === "user_action") {
    if (
      validateRecord(
        value,
        ["kind", "actionRef", "recordedAt"],
        [],
        issues,
        path,
      )
    ) {
      validateSafeToken(value.actionRef, issues, [...path, "actionRef"]);
      validateUtcTimestamp(value.recordedAt, issues, [...path, "recordedAt"]);
    }
    return;
  }
  if (value.kind === "external_evidence") {
    if (
      validateRecord(
        value,
        ["kind", "sourceRefs", "recordedAt"],
        [],
        issues,
        path,
      )
    ) {
      validateArray(
        value.sourceRefs,
        issues,
        [...path, "sourceRefs"],
        (item, itemIssues, itemPath) => {
          validateUuid(item, itemIssues, itemPath);
        },
        { minLength: 1, maxLength: 16 },
      );
      validateUniqueStrings(value.sourceRefs, issues, [...path, "sourceRefs"]);
      validateUtcTimestamp(value.recordedAt, issues, [...path, "recordedAt"]);
    }
    return;
  }
  addContractIssue(issues, "invalid_confirmation_evidence", [...path, "kind"]);
};

const validateRestaurantResolution = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
) => {
  if (
    !validateRecord(
      value,
      [
        "contractVersion",
        "state",
        "candidates",
        "selectedCandidateId",
        "restaurantId",
        "confirmationEvidence",
        "requiresUserConfirmation",
        "canContinueMenuOnly",
        "resolvedAt",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateVersion(
    value.contractVersion,
    CONTRACT_VERSIONS.restaurantResolution,
    issues,
    [...path, "contractVersion"],
  );
  const stateIsValid = validateEnumValue(
    value.state,
    RESTAURANT_RESOLUTION_STATES,
    issues,
    [...path, "state"],
  );
  validateArray(
    value.candidates,
    issues,
    [...path, "candidates"],
    validateRestaurantCandidate,
    { maxLength: 10 },
  );
  validateNullableString(
    value.selectedCandidateId,
    issues,
    [...path, "selectedCandidateId"],
    { pattern: UUID_PATTERN },
  );
  validateNullableString(value.restaurantId, issues, [...path, "restaurantId"], {
    pattern: UUID_PATTERN,
  });
  if (value.confirmationEvidence !== null) {
    validateConfirmationEvidence(value.confirmationEvidence, issues, [
      ...path,
      "confirmationEvidence",
    ]);
  }
  validateBoolean(value.requiresUserConfirmation, issues, [
    ...path,
    "requiresUserConfirmation",
  ]);
  validateLiteral(value.canContinueMenuOnly, true, issues, [
    ...path,
    "canContinueMenuOnly",
  ]);
  validateNullableString(value.resolvedAt, issues, [...path, "resolvedAt"], {
    minLength: 20,
    maxLength: 35,
  });
  if (typeof value.resolvedAt === "string") {
    validateUtcTimestamp(value.resolvedAt, issues, [...path, "resolvedAt"]);
  }

  if (!stateIsValid) {
    return;
  }
  const candidates = Array.isArray(value.candidates)
    ? value.candidates.filter(isContractRecord)
    : [];
  validateUniqueRecordField(candidates, "candidateId", issues, [
    ...path,
    "candidates",
  ]);
  validateUniqueRecordField(candidates, "rank", issues, [
    ...path,
    "candidates",
  ]);
  const candidateIds = new Set(candidates.map((candidate) => candidate.candidateId));
  const confirmed =
    value.state === "user_confirmed" ||
    value.state === "externally_verified";

  if (confirmed) {
    if (
      typeof value.selectedCandidateId !== "string" ||
      !candidateIds.has(value.selectedCandidateId)
    ) {
      addContractIssue(issues, "confirmed_candidate_must_be_present", [
        ...path,
        "selectedCandidateId",
      ]);
    }
    if (value.resolvedAt === null) {
      addContractIssue(issues, "confirmed_resolution_requires_time", [
        ...path,
        "resolvedAt",
      ]);
    }
    if (value.requiresUserConfirmation !== false) {
      addContractIssue(issues, "confirmed_resolution_cannot_request_confirmation", [
        ...path,
        "requiresUserConfirmation",
      ]);
    }
    if (!isContractRecord(value.confirmationEvidence)) {
      addContractIssue(issues, "confirmed_resolution_requires_evidence", [
        ...path,
        "confirmationEvidence",
      ]);
    } else if (
      value.state === "user_confirmed" &&
      value.confirmationEvidence.kind !== "user_action"
    ) {
      addContractIssue(issues, "user_confirmation_requires_user_action", [
        ...path,
        "confirmationEvidence",
      ]);
    } else if (
      value.state === "externally_verified" &&
      value.confirmationEvidence.kind !== "external_evidence"
    ) {
      addContractIssue(issues, "external_verification_requires_evidence", [
        ...path,
        "confirmationEvidence",
      ]);
    }
    return;
  }

  if (value.selectedCandidateId !== null || value.restaurantId !== null) {
    addContractIssue(issues, "unconfirmed_resolution_cannot_select_restaurant", path);
  }
  if (value.confirmationEvidence !== null || value.resolvedAt !== null) {
    addContractIssue(issues, "unconfirmed_resolution_cannot_claim_confirmation", path);
  }
  if (
    (value.state === "candidate" || value.state === "conflicting") &&
    value.requiresUserConfirmation !== true
  ) {
    addContractIssue(issues, "candidate_resolution_requires_user_confirmation", [
      ...path,
      "requiresUserConfirmation",
    ]);
  }
  if (
    value.state === "conflicting" &&
    (!Array.isArray(value.candidates) || value.candidates.length < 2)
  ) {
    addContractIssue(issues, "conflicting_resolution_requires_multiple_candidates", [
      ...path,
      "candidates",
    ]);
  }
};

const validateConfirmedRestaurantContext = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      ["restaurantId", "candidateId", "googlePlaceId", "resolutionState"],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateNullableString(value.restaurantId, issues, [...path, "restaurantId"], {
    pattern: UUID_PATTERN,
  });
  validateUuid(value.candidateId, issues, [...path, "candidateId"]);
  validateString(value.googlePlaceId, issues, [...path, "googlePlaceId"], {
    minLength: 5,
    maxLength: 256,
  });
  validateEnumValue(
    value.resolutionState,
    ["user_confirmed", "externally_verified"] as const,
    issues,
    [...path, "resolutionState"],
  );
};

const validateTransientMenuContent = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      [
        "kind",
        "contentHandle",
        "sensitivity",
        "byteCount",
        "pageCount",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateEnumValue(value.kind, MENU_CONTENT_KINDS, issues, [...path, "kind"]);
  validateSafeToken(value.contentHandle, issues, [...path, "contentHandle"]);
  validateLiteral(value.sensitivity, "sensitive_transient", issues, [
    ...path,
    "sensitivity",
  ]);
  if (value.byteCount !== null) {
    validateInteger(value.byteCount, issues, [...path, "byteCount"], {
      minimum: 0,
    });
  }
  if (value.pageCount !== null) {
    validateInteger(value.pageCount, issues, [...path, "pageCount"], {
      minimum: 1,
    });
  }
  if (
    value.kind === "image_collection" &&
    value.pageCount !== null
  ) {
    addContractIssue(issues, "image_collection_cannot_claim_page_count", [
      ...path,
      "pageCount",
    ]);
  }
};

const validateMenuSourceInput = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
) => {
  if (
    !validateRecord(
      value,
      [
        "contractVersion",
        "source",
        "restaurantContext",
        "menuScope",
        "content",
        "requestedAt",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateVersion(
    value.contractVersion,
    CONTRACT_VERSIONS.menuSource,
    issues,
    [...path, "contractVersion"],
  );
  validateSafeSourceReference(value.source, issues, [...path, "source"]);
  if (value.restaurantContext !== null) {
    validateConfirmedRestaurantContext(value.restaurantContext, issues, [
      ...path,
      "restaurantContext",
    ]);
  }
  validateEnumValue(value.menuScope, MENU_SCOPES, issues, [
    ...path,
    "menuScope",
  ]);
  validateTransientMenuContent(value.content, issues, [...path, "content"]);
  validateUtcTimestamp(value.requestedAt, issues, [...path, "requestedAt"]);
};

const validateExtractedMenuItem = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      [
        "itemIndex",
        "name",
        "description",
        "price",
        "optionTexts",
        "sourceEvidence",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateInteger(value.itemIndex, issues, [...path, "itemIndex"], {
    minimum: 0,
  });
  validateString(value.name, issues, [...path, "name"], {
    minLength: 1,
    maxLength: 240,
  });
  validateNullableString(value.description, issues, [...path, "description"], {
    minLength: 1,
    maxLength: 2000,
  });
  validateNullableMoney(value.price, issues, [...path, "price"]);
  validateArray(
    value.optionTexts,
    issues,
    [...path, "optionTexts"],
    (item, itemIssues, itemPath) => {
      validateString(item, itemIssues, itemPath, {
        minLength: 1,
        maxLength: 500,
      });
    },
    { maxLength: 64 },
  );
  validateArray(
    value.sourceEvidence,
    issues,
    [...path, "sourceEvidence"],
    validateMenuSourceEvidence,
    { minLength: 1, maxLength: 32 },
  );
};

const validateExtractedMenuSection = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      ["sectionIndex", "name", "items"],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateInteger(value.sectionIndex, issues, [...path, "sectionIndex"], {
    minimum: 0,
  });
  validateNullableString(value.name, issues, [...path, "name"], {
    minLength: 1,
    maxLength: 240,
  });
  validateArray(
    value.items,
    issues,
    [...path, "items"],
    validateExtractedMenuItem,
    { minLength: 1, maxLength: 1000 },
  );
};

const validateCompactMenuExtraction = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
) => {
  if (
    !validateRecord(
      value,
      [
        "contractVersion",
        "extractionState",
        "source",
        "restaurantContext",
        "menuScope",
        "sections",
        "warningCodes",
        "completedAt",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateVersion(
    value.contractVersion,
    CONTRACT_VERSIONS.compactExtraction,
    issues,
    [...path, "contractVersion"],
  );
  validateLiteral(value.extractionState, "unvalidated", issues, [
    ...path,
    "extractionState",
  ]);
  validateSafeSourceReference(value.source, issues, [...path, "source"]);
  if (value.restaurantContext !== null) {
    validateConfirmedRestaurantContext(value.restaurantContext, issues, [
      ...path,
      "restaurantContext",
    ]);
  }
  validateEnumValue(value.menuScope, MENU_SCOPES, issues, [
    ...path,
    "menuScope",
  ]);
  validateArray(
    value.sections,
    issues,
    [...path, "sections"],
    validateExtractedMenuSection,
    { minLength: 1, maxLength: 200 },
  );
  if (Array.isArray(value.sections)) {
    const sections = value.sections.filter(isContractRecord);
    validateUniqueRecordField(sections, "sectionIndex", issues, [
      ...path,
      "sections",
    ]);
    sections.forEach((section, sectionPosition) => {
      if (Array.isArray(section.items)) {
        validateUniqueRecordField(
          section.items.filter(isContractRecord),
          "itemIndex",
          issues,
          [...path, "sections", sectionPosition, "items"],
        );
      }
    });
  }
  validateArray(
    value.warningCodes,
    issues,
    [...path, "warningCodes"],
    (item, itemIssues, itemPath) => {
      validateEnumValue(
        item,
        EXTRACTION_WARNING_CODES,
        itemIssues,
        itemPath,
      );
    },
    { maxLength: EXTRACTION_WARNING_CODES.length },
  );
  validateUniqueStrings(value.warningCodes, issues, [...path, "warningCodes"]);
  validateUtcTimestamp(value.completedAt, issues, [...path, "completedAt"]);
};

const validateRestaurantMenuVersion = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      [
        "menuVersionId",
        "restaurantId",
        "menuScope",
        "state",
        "versionOrdinal",
        "sourceRefs",
        "collectedAt",
        "validFrom",
        "validUntil",
        "supersedesMenuVersionId",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateUuid(value.menuVersionId, issues, [...path, "menuVersionId"]);
  validateUuid(value.restaurantId, issues, [...path, "restaurantId"]);
  validateEnumValue(value.menuScope, MENU_SCOPES, issues, [
    ...path,
    "menuScope",
  ]);
  validateEnumValue(value.state, MENU_VERSION_STATES, issues, [...path, "state"]);
  validateInteger(value.versionOrdinal, issues, [...path, "versionOrdinal"], {
    minimum: 1,
  });
  validateArray(
    value.sourceRefs,
    issues,
    [...path, "sourceRefs"],
    (item, itemIssues, itemPath) => {
      validateUuid(item, itemIssues, itemPath);
    },
    { minLength: 1, maxLength: 32 },
  );
  validateUniqueStrings(value.sourceRefs, issues, [...path, "sourceRefs"]);
  validateUtcTimestamp(value.collectedAt, issues, [...path, "collectedAt"]);
  validateUtcTimestamp(value.validFrom, issues, [...path, "validFrom"]);
  validateNullableString(value.validUntil, issues, [...path, "validUntil"], {
    minLength: 20,
    maxLength: 35,
  });
  if (typeof value.validUntil === "string") {
    validateUtcTimestamp(value.validUntil, issues, [...path, "validUntil"]);
    if (
      typeof value.validFrom === "string" &&
      Date.parse(value.validUntil) <= Date.parse(value.validFrom)
    ) {
      addContractIssue(issues, "menu_validity_range_invalid", [
        ...path,
        "validUntil",
      ]);
    }
  }
  validateNullableString(
    value.supersedesMenuVersionId,
    issues,
    [...path, "supersedesMenuVersionId"],
    { pattern: UUID_PATTERN },
  );
  if (value.supersedesMenuVersionId === value.menuVersionId) {
    addContractIssue(issues, "menu_version_cannot_supersede_itself", [
      ...path,
      "supersedesMenuVersionId",
    ]);
  }
};

const validateMenuItem = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      [
        "menuItemId",
        "menuVersionId",
        "sectionIndex",
        "itemIndex",
        "name",
        "description",
        "price",
        "optionTexts",
        "sourceEvidence",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateUuid(value.menuItemId, issues, [...path, "menuItemId"]);
  validateNullableString(value.menuVersionId, issues, [...path, "menuVersionId"], {
    pattern: UUID_PATTERN,
  });
  validateInteger(value.sectionIndex, issues, [...path, "sectionIndex"], {
    minimum: 0,
  });
  validateInteger(value.itemIndex, issues, [...path, "itemIndex"], {
    minimum: 0,
  });
  validateString(value.name, issues, [...path, "name"], {
    minLength: 1,
    maxLength: 240,
  });
  validateNullableString(value.description, issues, [...path, "description"], {
    minLength: 1,
    maxLength: 2000,
  });
  validateNullableMoney(value.price, issues, [...path, "price"]);
  validateArray(
    value.optionTexts,
    issues,
    [...path, "optionTexts"],
    (item, itemIssues, itemPath) => {
      validateString(item, itemIssues, itemPath, {
        minLength: 1,
        maxLength: 500,
      });
    },
    { maxLength: 64 },
  );
  validateArray(
    value.sourceEvidence,
    issues,
    [...path, "sourceEvidence"],
    validateMenuSourceEvidence,
    { minLength: 1, maxLength: 32 },
  );
};

const validateDishCandidate = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
) => {
  if (
    !validateRecord(
      value,
      [
        "contractVersion",
        "candidateId",
        "dishId",
        "displayName",
        "normalizedName",
        "aliases",
        "sourceEvidence",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateVersion(
    value.contractVersion,
    CONTRACT_VERSIONS.dishKnowledge,
    issues,
    [...path, "contractVersion"],
  );
  validateUuid(value.candidateId, issues, [...path, "candidateId"]);
  validateNullableString(value.dishId, issues, [...path, "dishId"], {
    pattern: UUID_PATTERN,
  });
  validateString(value.displayName, issues, [...path, "displayName"], {
    minLength: 1,
    maxLength: 240,
  });
  validateString(value.normalizedName, issues, [...path, "normalizedName"], {
    minLength: 1,
    maxLength: 240,
  });
  validateArray(
    value.aliases,
    issues,
    [...path, "aliases"],
    (item, itemIssues, itemPath) => {
      validateString(item, itemIssues, itemPath, {
        minLength: 1,
        maxLength: 240,
      });
    },
    { maxLength: 64 },
  );
  validateUniqueStrings(value.aliases, issues, [...path, "aliases"]);
  validateArray(
    value.sourceEvidence,
    issues,
    [...path, "sourceEvidence"],
    validateMenuSourceEvidence,
    { minLength: 1, maxLength: 32 },
  );
};

const validateMatchDecision = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      ["kind", "reviewerRef", "ruleVersion", "decidedAt"],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  const kindIsValid = validateEnumValue(
    value.kind,
    MATCH_DECISION_KINDS,
    issues,
    [...path, "kind"],
  );
  validateNullableString(value.reviewerRef, issues, [...path, "reviewerRef"], {
    minLength: 8,
    maxLength: 256,
  });
  validateNullableString(value.ruleVersion, issues, [...path, "ruleVersion"], {
    minLength: 3,
    maxLength: 128,
  });
  validateUtcTimestamp(value.decidedAt, issues, [...path, "decidedAt"]);
  if (kindIsValid && value.kind === "human_reviewed") {
    if (typeof value.reviewerRef !== "string" || value.ruleVersion !== null) {
      addContractIssue(issues, "invalid_human_match_decision", path);
    }
  }
  if (kindIsValid && value.kind === "deterministic_rule") {
    if (value.reviewerRef !== null || typeof value.ruleVersion !== "string") {
      addContractIssue(issues, "invalid_rule_match_decision", path);
    }
  }
};

const validateMenuItemDishMatch = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      [
        "matchId",
        "menuItemId",
        "dishCandidateId",
        "dishId",
        "state",
        "decision",
        "sourceEvidence",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateUuid(value.matchId, issues, [...path, "matchId"]);
  validateUuid(value.menuItemId, issues, [...path, "menuItemId"]);
  validateUuid(value.dishCandidateId, issues, [...path, "dishCandidateId"]);
  validateNullableString(value.dishId, issues, [...path, "dishId"], {
    pattern: UUID_PATTERN,
  });
  const stateIsValid = validateEnumValue(
    value.state,
    DISH_MATCH_STATES,
    issues,
    [...path, "state"],
  );
  if (value.decision !== null) {
    validateMatchDecision(value.decision, issues, [...path, "decision"]);
  }
  validateArray(
    value.sourceEvidence,
    issues,
    [...path, "sourceEvidence"],
    validateMenuSourceEvidence,
    { minLength: 1, maxLength: 32 },
  );
  if (!stateIsValid) {
    return;
  }
  if (value.state === "matched") {
    if (typeof value.dishId !== "string" || value.decision === null) {
      addContractIssue(issues, "matched_dish_requires_identity_and_decision", path);
    }
  } else if (value.state === "rejected") {
    if (value.dishId !== null || value.decision === null) {
      addContractIssue(issues, "rejected_match_requires_decision_without_dish", path);
    }
  } else if (value.dishId !== null || value.decision !== null) {
    addContractIssue(issues, "undecided_match_cannot_claim_decision", path);
  }
};

const validateClaimValue = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (!isContractRecord(value)) {
    addContractIssue(issues, "expected_object", path);
    return;
  }
  const kindIsValid = validateEnumValue(
    value.kind,
    CULINARY_CLAIM_KINDS,
    issues,
    [...path, "kind"],
  );
  if (!kindIsValid) {
    return;
  }
  if (
    value.kind === "basic_tastes" ||
    value.kind === "flavor_notes" ||
    value.kind === "textures"
  ) {
    if (!validateRecord(value, ["kind", "values"], [], issues, path)) {
      return;
    }
    const allowed =
      value.kind === "basic_tastes"
        ? BASIC_TASTES
        : value.kind === "flavor_notes"
          ? FLAVOR_NOTES
          : TEXTURES;
    validateArray(
      value.values,
      issues,
      [...path, "values"],
      (item, itemIssues, itemPath) => {
        validateEnumValue(item, allowed, itemIssues, itemPath);
      },
      { minLength: 1, maxLength: allowed.length },
    );
    validateUniqueStrings(value.values, issues, [...path, "values"]);
    return;
  }
  if (
    value.kind === "heat" ||
    value.kind === "richness" ||
    value.kind === "heat_adjustability"
  ) {
    if (!validateRecord(value, ["kind", "value"], [], issues, path)) {
      return;
    }
    const allowed =
      value.kind === "heat"
        ? HEAT_LEVELS
        : value.kind === "richness"
          ? RICHNESS_LEVELS
          : HEAT_ADJUSTABILITY_STATES;
    validateEnumValue(value.value, allowed, issues, [...path, "value"]);
    return;
  }
  if (
    validateRecord(
      value,
      ["kind", "ingredientRef", "ingredientName", "role"],
      [],
      issues,
      path,
    )
  ) {
    validateNullableString(value.ingredientRef, issues, [
      ...path,
      "ingredientRef",
    ], { pattern: UUID_PATTERN });
    validateString(value.ingredientName, issues, [...path, "ingredientName"], {
      minLength: 1,
      maxLength: 240,
    });
    validateEnumValue(value.role, INGREDIENT_ROLES, issues, [...path, "role"]);
  }
};

const validateMenuItemClaim = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      [
        "claimId",
        "menuItemId",
        "claim",
        "basis",
        "provenance",
        "recordedAt",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateUuid(value.claimId, issues, [...path, "claimId"]);
  validateUuid(value.menuItemId, issues, [...path, "menuItemId"]);
  validateClaimValue(value.claim, issues, [...path, "claim"]);
  validateEnumValue(
    value.basis,
    ["source_stated", "inferred_from_source"] as const,
    issues,
    [...path, "basis"],
  );
  validateArray(
    value.provenance,
    issues,
    [...path, "provenance"],
    validateMenuSourceEvidence,
    { minLength: 1, maxLength: 32 },
  );
  validateUtcTimestamp(value.recordedAt, issues, [...path, "recordedAt"]);
};

const validateDishClaim = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      [
        "claimId",
        "dishId",
        "claim",
        "basis",
        "originKind",
        "reviewState",
        "profileVersion",
        "provenance",
        "recordedAt",
        "reviewedAt",
        "supersedesClaimId",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateUuid(value.claimId, issues, [...path, "claimId"]);
  validateUuid(value.dishId, issues, [...path, "dishId"]);
  validateClaimValue(value.claim, issues, [...path, "claim"]);
  validateLiteral(value.basis, "culinary_baseline", issues, [...path, "basis"]);
  validateEnumValue(value.originKind, KNOWLEDGE_ORIGIN_KINDS, issues, [
    ...path,
    "originKind",
  ]);
  const reviewIsValid = validateEnumValue(
    value.reviewState,
    KNOWLEDGE_REVIEW_STATES,
    issues,
    [...path, "reviewState"],
  );
  validateString(value.profileVersion, issues, [...path, "profileVersion"], {
    minLength: 3,
    maxLength: 128,
  });
  validateArray(
    value.provenance,
    issues,
    [...path, "provenance"],
    validateKnowledgeSourceEvidence,
    { minLength: 1, maxLength: 32 },
  );
  validateUtcTimestamp(value.recordedAt, issues, [...path, "recordedAt"]);
  validateNullableString(value.reviewedAt, issues, [...path, "reviewedAt"], {
    minLength: 20,
    maxLength: 35,
  });
  if (typeof value.reviewedAt === "string") {
    validateUtcTimestamp(value.reviewedAt, issues, [...path, "reviewedAt"]);
  }
  validateNullableString(
    value.supersedesClaimId,
    issues,
    [...path, "supersedesClaimId"],
    { pattern: UUID_PATTERN },
  );
  if (value.supersedesClaimId === value.claimId) {
    addContractIssue(issues, "claim_cannot_supersede_itself", [
      ...path,
      "supersedesClaimId",
    ]);
  }
  if (reviewIsValid) {
    if (value.reviewState === "reviewed" && value.reviewedAt === null) {
      addContractIssue(issues, "reviewed_claim_requires_review_time", [
        ...path,
        "reviewedAt",
      ]);
    }
    if (value.reviewState === "unreviewed" && value.reviewedAt !== null) {
      addContractIssue(issues, "unreviewed_claim_cannot_claim_review_time", [
        ...path,
        "reviewedAt",
      ]);
    }
  }
};

type EffectiveValueValidator = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => void;

const validateIngredientValue = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    !validateRecord(
      value,
      ["ingredientRef", "ingredientName", "role"],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateNullableString(value.ingredientRef, issues, [
    ...path,
    "ingredientRef",
  ], { pattern: UUID_PATTERN });
  validateString(value.ingredientName, issues, [...path, "ingredientName"], {
    minLength: 1,
    maxLength: 240,
  });
  validateEnumValue(value.role, INGREDIENT_ROLES, issues, [...path, "role"]);
};

const validateEffectiveField = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
  validateValue: EffectiveValueValidator,
) => {
  if (!isContractRecord(value)) {
    addContractIssue(issues, "expected_object", path);
    return;
  }
  if (value.state === "unknown") {
    if (
      !validateRecord(
        value,
        ["state", "basis", "claimIds", "provenance"],
        [],
        issues,
        path,
      )
    ) {
      return;
    }
    validateLiteral(value.basis, "unknown", issues, [...path, "basis"]);
    if (!Array.isArray(value.claimIds) || value.claimIds.length !== 0) {
      addContractIssue(issues, "unknown_field_cannot_have_claims", [
        ...path,
        "claimIds",
      ]);
    }
    if (!Array.isArray(value.provenance) || value.provenance.length !== 0) {
      addContractIssue(issues, "unknown_field_cannot_have_provenance", [
        ...path,
        "provenance",
      ]);
    }
    return;
  }
  if (value.state === "known") {
    if (
      !validateRecord(
        value,
        ["state", "value", "basis", "claimIds", "provenance"],
        [],
        issues,
        path,
      )
    ) {
      return;
    }
    validateEnumValue(
      value.basis,
      ["source_stated", "inferred_from_source", "culinary_baseline"] as const,
      issues,
      [...path, "basis"],
    );
    validateValue(value.value, issues, [...path, "value"]);
    validateArray(
      value.claimIds,
      issues,
      [...path, "claimIds"],
      (item, itemIssues, itemPath) => {
        validateUuid(item, itemIssues, itemPath);
      },
      { minLength: 1, maxLength: 128 },
    );
    validateUniqueStrings(value.claimIds, issues, [...path, "claimIds"]);
    validateArray(
      value.provenance,
      issues,
      [...path, "provenance"],
      validateProvenanceReference,
      { minLength: 1, maxLength: 128 },
    );
    if (Array.isArray(value.provenance)) {
      const expectedKind =
        value.basis === "culinary_baseline"
          ? "knowledge_source"
          : "menu_source";
      if (
        value.provenance.some(
          (entry) => !isContractRecord(entry) || entry.kind !== expectedKind,
        )
      ) {
        addContractIssue(issues, "effective_field_provenance_basis_mismatch", [
          ...path,
          "provenance",
        ]);
      }
    }
    return;
  }
  addContractIssue(issues, "invalid_effective_field_state", [...path, "state"]);
};

const enumArrayValidator =
  <T extends string>(allowed: readonly T[]): EffectiveValueValidator =>
  (value, issues, path) => {
    validateArray(
      value,
      issues,
      path,
      (item, itemIssues, itemPath) => {
        validateEnumValue(item, allowed, itemIssues, itemPath);
      },
      { minLength: 1, maxLength: allowed.length },
    );
    validateUniqueStrings(value, issues, path);
  };

const enumValueValidator =
  <T extends string>(allowed: readonly T[]): EffectiveValueValidator =>
  (value, issues, path) => {
    validateEnumValue(value, allowed, issues, path);
  };

const validateEffectiveDishProfile = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
) => {
  if (
    !validateRecord(
      value,
      [
        "contractVersion",
        "kind",
        "menuItemId",
        "dishId",
        "matchId",
        "mergePolicyVersion",
        "dishKnowledgeVersion",
        "inputClaimIds",
        "fields",
        "derivedAt",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateVersion(
    value.contractVersion,
    CONTRACT_VERSIONS.boundaryDtos,
    issues,
    [...path, "contractVersion"],
  );
  validateLiteral(value.kind, "derived", issues, [...path, "kind"]);
  validateUuid(value.menuItemId, issues, [...path, "menuItemId"]);
  validateUuid(value.dishId, issues, [...path, "dishId"]);
  validateUuid(value.matchId, issues, [...path, "matchId"]);
  validateVersion(
    value.mergePolicyVersion,
    CONTRACT_VERSIONS.mergePolicy,
    issues,
    [...path, "mergePolicyVersion"],
  );
  validateVersion(
    value.dishKnowledgeVersion,
    CONTRACT_VERSIONS.dishKnowledge,
    issues,
    [...path, "dishKnowledgeVersion"],
  );
  validateArray(
    value.inputClaimIds,
    issues,
    [...path, "inputClaimIds"],
    (item, itemIssues, itemPath) => {
      validateUuid(item, itemIssues, itemPath);
    },
    { maxLength: 256 },
  );
  validateUniqueStrings(value.inputClaimIds, issues, [...path, "inputClaimIds"]);
  if (
    validateRecord(
      value.fields,
      [
        "basicTastes",
        "flavorNotes",
        "textures",
        "heat",
        "richness",
        "heatAdjustability",
        "ingredients",
      ],
      [],
      issues,
      [...path, "fields"],
    )
  ) {
    validateEffectiveField(
      value.fields.basicTastes,
      issues,
      [...path, "fields", "basicTastes"],
      enumArrayValidator(BASIC_TASTES),
    );
    validateEffectiveField(
      value.fields.flavorNotes,
      issues,
      [...path, "fields", "flavorNotes"],
      enumArrayValidator(FLAVOR_NOTES),
    );
    validateEffectiveField(
      value.fields.textures,
      issues,
      [...path, "fields", "textures"],
      enumArrayValidator(TEXTURES),
    );
    validateEffectiveField(
      value.fields.heat,
      issues,
      [...path, "fields", "heat"],
      enumValueValidator(HEAT_LEVELS),
    );
    validateEffectiveField(
      value.fields.richness,
      issues,
      [...path, "fields", "richness"],
      enumValueValidator(RICHNESS_LEVELS),
    );
    validateEffectiveField(
      value.fields.heatAdjustability,
      issues,
      [...path, "fields", "heatAdjustability"],
      enumValueValidator(HEAT_ADJUSTABILITY_STATES),
    );
    validateEffectiveField(
      value.fields.ingredients,
      issues,
      [...path, "fields", "ingredients"],
      (fieldValue, fieldIssues, fieldPath) => {
        validateArray(
          fieldValue,
          fieldIssues,
          fieldPath,
          validateIngredientValue,
          { minLength: 1, maxLength: 128 },
        );
      },
    );
  }
  validateUtcTimestamp(value.derivedAt, issues, [...path, "derivedAt"]);
};

const claimFieldName = (claim: unknown): keyof EffectiveDishProfile["fields"] | null => {
  if (!isContractRecord(claim)) {
    return null;
  }
  switch (claim.kind) {
    case "basic_tastes":
      return "basicTastes";
    case "flavor_notes":
      return "flavorNotes";
    case "textures":
      return "textures";
    case "heat":
      return "heat";
    case "richness":
      return "richness";
    case "heat_adjustability":
      return "heatAdjustability";
    case "ingredient":
      return "ingredients";
    default:
      return null;
  }
};

const EFFECTIVE_FIELD_NAMES = [
  "basicTastes",
  "flavorNotes",
  "textures",
  "heat",
  "richness",
  "heatAdjustability",
  "ingredients",
] as const satisfies readonly (keyof EffectiveDishProfile["fields"])[];

const contractValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => contractValuesEqual(item, right[index]))
    );
  }
  if (isContractRecord(left) || isContractRecord(right)) {
    if (!isContractRecord(left) || !isContractRecord(right)) {
      return false;
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      contractValuesEqual(leftKeys, rightKeys) &&
      leftKeys.every((key) => contractValuesEqual(left[key], right[key]))
    );
  }
  return false;
};

const appendUniqueContractValue = (values: unknown[], candidate: unknown) => {
  if (!values.some((value) => contractValuesEqual(value, candidate))) {
    values.push(candidate);
  }
};

const claimEffectiveValue = (
  fieldName: keyof EffectiveDishProfile["fields"],
  claimRecord: Readonly<Record<string, unknown>>,
): unknown => {
  const claim = isContractRecord(claimRecord.claim)
    ? claimRecord.claim
    : null;
  if (!claim || claimFieldName(claim) !== fieldName) {
    return undefined;
  }
  if (
    fieldName === "basicTastes" ||
    fieldName === "flavorNotes" ||
    fieldName === "textures"
  ) {
    return claim.values;
  }
  if (fieldName === "ingredients") {
    return {
      ingredientRef: claim.ingredientRef,
      ingredientName: claim.ingredientName,
      role: claim.role,
    };
  }
  return claim.value;
};

const expectedEffectiveValue = (
  fieldName: keyof EffectiveDishProfile["fields"],
  claims: readonly Readonly<Record<string, unknown>>[],
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
): unknown => {
  if (
    fieldName === "basicTastes" ||
    fieldName === "flavorNotes" ||
    fieldName === "textures"
  ) {
    const values: unknown[] = [];
    for (const claim of claims) {
      const claimValue = claimEffectiveValue(fieldName, claim);
      if (Array.isArray(claimValue)) {
        claimValue.forEach((value) => appendUniqueContractValue(values, value));
      }
    }
    return values;
  }
  if (fieldName === "ingredients") {
    const values: unknown[] = [];
    claims.forEach((claim) => {
      const claimValue = claimEffectiveValue(fieldName, claim);
      if (claimValue !== undefined) {
        appendUniqueContractValue(values, claimValue);
      }
    });
    return values;
  }
  const values = claims
    .map((claim) => claimEffectiveValue(fieldName, claim))
    .filter((value) => value !== undefined);
  const firstValue = values[0];
  if (
    firstValue !== undefined &&
    values.some((value) => !contractValuesEqual(value, firstValue))
  ) {
    addContractIssue(issues, "effective_field_claim_value_conflict", path);
  }
  return firstValue;
};

const expectedEffectiveProvenance = (
  claims: readonly Readonly<Record<string, unknown>>[],
): unknown[] => {
  const provenance: unknown[] = [];
  for (const claim of claims) {
    if (Array.isArray(claim.provenance)) {
      claim.provenance.forEach((entry) => {
        appendUniqueContractValue(provenance, entry);
      });
    }
  }
  return provenance;
};

const validateAllowedMenuEvidence = (
  records: readonly Readonly<Record<string, unknown>>[],
  collectionName: string,
  evidenceField: "sourceEvidence" | "provenance",
  allowedSourceRefs: ReadonlySet<string>,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  records.forEach((record, recordIndex) => {
    const evidenceRecords = record[evidenceField];
    if (!Array.isArray(evidenceRecords)) {
      return;
    }
    evidenceRecords.forEach((evidence, evidenceIndex) => {
      if (
        isContractRecord(evidence) &&
        typeof evidence.sourceRef === "string" &&
        !allowedSourceRefs.has(evidence.sourceRef)
      ) {
        addContractIssue(issues, "menu_evidence_source_not_allowed", [
          ...path,
          collectionName,
          recordIndex,
          evidenceField,
          evidenceIndex,
          "sourceRef",
        ]);
      }
    });
  });
};

const validateCanonicalRelationships = (
  value: Readonly<Record<string, unknown>>,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  const resolution = isContractRecord(value.restaurantResolution)
    ? value.restaurantResolution
    : null;
  const confirmed =
    resolution?.state === "user_confirmed" ||
    resolution?.state === "externally_verified";
  if (value.publicationState === "eligible") {
    if (!confirmed || !isContractRecord(value.menuVersion)) {
      addContractIssue(issues, "eligible_publication_requires_restaurant_menu", path);
    }
  }
  if (value.publicationState === "analysis_only" && value.menuVersion !== null) {
    addContractIssue(issues, "analysis_only_cannot_publish_menu_version", [
      ...path,
      "menuVersion",
    ]);
  }

  const menuVersion = isContractRecord(value.menuVersion)
    ? value.menuVersion
    : null;
  const menuItems = Array.isArray(value.menuItems)
    ? value.menuItems.filter(isContractRecord)
    : [];
  const dishCandidates = Array.isArray(value.dishCandidates)
    ? value.dishCandidates.filter(isContractRecord)
    : [];
  const matches = Array.isArray(value.dishMatches)
    ? value.dishMatches.filter(isContractRecord)
    : [];
  const menuClaims = Array.isArray(value.menuItemClaims)
    ? value.menuItemClaims.filter(isContractRecord)
    : [];
  const dishClaims = Array.isArray(value.dishClaims)
    ? value.dishClaims.filter(isContractRecord)
    : [];
  const profiles = Array.isArray(value.effectiveProfiles)
    ? value.effectiveProfiles.filter(isContractRecord)
    : [];

  const menuItemIds = new Set(menuItems.map((item) => item.menuItemId));
  const candidateIds = new Set(
    dishCandidates.map((candidate) => candidate.candidateId),
  );
  const candidatesById = new Map(
    dishCandidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const matchesById = new Map(matches.map((match) => [match.matchId, match]));
  const menuClaimsById = new Map(
    menuClaims.map((claim) => [claim.claimId, claim]),
  );
  const dishClaimsById = new Map(
    dishClaims.map((claim) => [claim.claimId, claim]),
  );
  const allClaimsById = new Map([...menuClaimsById, ...dishClaimsById]);
  const analysisSourceRef =
    isContractRecord(value.source) && typeof value.source.sourceRef === "string"
      ? value.source.sourceRef
      : null;
  const allowedSourceRefs = new Set<string>();
  if (analysisSourceRef) {
    allowedSourceRefs.add(analysisSourceRef);
  }

  validateUniqueRecordField(menuItems, "menuItemId", issues, [
    ...path,
    "menuItems",
  ]);
  const menuItemPositions = new Set<string>();
  menuItems.forEach((item, index) => {
    const position = `${String(item.sectionIndex)}:${String(item.itemIndex)}`;
    if (menuItemPositions.has(position)) {
      addContractIssue(issues, "duplicate_menu_item_position", [
        ...path,
        "menuItems",
        index,
      ]);
    }
    menuItemPositions.add(position);
  });
  validateUniqueRecordField(dishCandidates, "candidateId", issues, [
    ...path,
    "dishCandidates",
  ]);
  validateUniqueRecordField(matches, "matchId", issues, [
    ...path,
    "dishMatches",
  ]);
  const matchPairs = new Set<string>();
  matches.forEach((match, index) => {
    const pair = `${String(match.menuItemId)}:${String(match.dishCandidateId)}`;
    if (matchPairs.has(pair)) {
      addContractIssue(issues, "duplicate_menu_item_dish_candidate_pair", [
        ...path,
        "dishMatches",
        index,
      ]);
    }
    matchPairs.add(pair);
  });
  validateUniqueRecordField([...menuClaims, ...dishClaims], "claimId", issues, [
    ...path,
    "claims",
  ]);
  validateUniqueRecordField(profiles, "matchId", issues, [
    ...path,
    "effectiveProfiles",
  ]);

  if (value.publicationState === "eligible" && menuVersion && resolution) {
    if (
      typeof resolution.restaurantId !== "string" ||
      resolution.restaurantId !== menuVersion.restaurantId
    ) {
      addContractIssue(issues, "menu_version_restaurant_identity_mismatch", [
        ...path,
        "menuVersion",
        "restaurantId",
      ]);
    }
  }
  if (
    menuVersion &&
    analysisSourceRef &&
    !contractValuesEqual(menuVersion.sourceRefs, [analysisSourceRef])
  ) {
    addContractIssue(issues, "menu_version_source_refs_mismatch", [
      ...path,
      "menuVersion",
      "sourceRefs",
    ]);
  }

  validateAllowedMenuEvidence(
    menuItems,
    "menuItems",
    "sourceEvidence",
    allowedSourceRefs,
    issues,
    path,
  );
  validateAllowedMenuEvidence(
    dishCandidates,
    "dishCandidates",
    "sourceEvidence",
    allowedSourceRefs,
    issues,
    path,
  );
  validateAllowedMenuEvidence(
    matches,
    "dishMatches",
    "sourceEvidence",
    allowedSourceRefs,
    issues,
    path,
  );
  validateAllowedMenuEvidence(
    menuClaims,
    "menuItemClaims",
    "provenance",
    allowedSourceRefs,
    issues,
    path,
  );

  for (const [index, item] of menuItems.entries()) {
    const expectedMenuVersionId = menuVersion?.menuVersionId ?? null;
    if (item.menuVersionId !== expectedMenuVersionId) {
      addContractIssue(issues, "menu_item_version_mismatch", [
        ...path,
        "menuItems",
        index,
        "menuVersionId",
      ]);
    }
  }

  for (const [index, match] of matches.entries()) {
    if (!menuItemIds.has(match.menuItemId)) {
      addContractIssue(issues, "match_references_missing_menu_item", [
        ...path,
        "dishMatches",
        index,
        "menuItemId",
      ]);
    }
    if (!candidateIds.has(match.dishCandidateId)) {
      addContractIssue(issues, "match_references_missing_candidate", [
        ...path,
        "dishMatches",
        index,
        "dishCandidateId",
      ]);
    }
    const candidate = candidatesById.get(match.dishCandidateId);
    if (
      candidate &&
      match.state === "matched" &&
      candidate.dishId !== match.dishId
    ) {
      addContractIssue(issues, "match_dish_identity_mismatch", [
        ...path,
        "dishMatches",
        index,
        "dishId",
      ]);
    }
  }

  for (const [index, claim] of menuClaims.entries()) {
    if (!menuItemIds.has(claim.menuItemId)) {
      addContractIssue(issues, "claim_references_missing_menu_item", [
        ...path,
        "menuItemClaims",
        index,
        "menuItemId",
      ]);
    }
  }

  for (const [profileIndex, profile] of profiles.entries()) {
    const match = matchesById.get(profile.matchId);
    if (
      !match ||
      match.state !== "matched" ||
      match.menuItemId !== profile.menuItemId ||
      match.dishId !== profile.dishId
    ) {
      addContractIssue(issues, "effective_profile_requires_confirmed_match", [
        ...path,
        "effectiveProfiles",
        profileIndex,
      ]);
    }
    const inputClaimIds = Array.isArray(profile.inputClaimIds)
      ? profile.inputClaimIds.filter((item): item is string => typeof item === "string")
      : [];
    const referencedFieldClaimIds = new Set<string>();
    const expectedInputClaimIds: string[] = [];
    for (const [claimIndex, claimId] of inputClaimIds.entries()) {
      if (!allClaimsById.has(claimId)) {
        addContractIssue(issues, "effective_profile_references_missing_claim", [
          ...path,
          "effectiveProfiles",
          profileIndex,
          "inputClaimIds",
          claimIndex,
        ]);
      }
    }
    if (!isContractRecord(profile.fields)) {
      continue;
    }
    for (const fieldName of EFFECTIVE_FIELD_NAMES) {
      const field = profile.fields[fieldName];
      if (!isContractRecord(field)) {
        continue;
      }
      const menuFieldClaims = menuClaims.filter(
        (claim) =>
          claim.menuItemId === profile.menuItemId &&
          isContractRecord(claim.claim) &&
          claimFieldName(claim.claim) === fieldName,
      );
      const reviewedDishFieldClaims = dishClaims.filter(
        (claim) =>
          claim.dishId === profile.dishId &&
          claim.reviewState === "reviewed" &&
          isContractRecord(claim.claim) &&
          claimFieldName(claim.claim) === fieldName,
      );
      const sourceStatedClaims = menuFieldClaims.filter(
        (claim) => claim.basis === "source_stated",
      );
      const inferredClaims = menuFieldClaims.filter(
        (claim) => claim.basis === "inferred_from_source",
      );
      const selectedClaims =
        sourceStatedClaims.length > 0
          ? sourceStatedClaims
          : inferredClaims.length > 0
            ? inferredClaims
            : reviewedDishFieldClaims;
      const expectedBasis =
        sourceStatedClaims.length > 0
          ? "source_stated"
          : inferredClaims.length > 0
            ? "inferred_from_source"
            : reviewedDishFieldClaims.length > 0
              ? "culinary_baseline"
              : null;
      const expectedClaimIds = selectedClaims
        .map((claim) => claim.claimId)
        .filter((claimId): claimId is string => typeof claimId === "string");
      expectedInputClaimIds.push(...expectedClaimIds);
      if (field.state !== "known") {
        if (
          menuFieldClaims.length > 0 ||
          reviewedDishFieldClaims.length > 0
        ) {
          addContractIssue(issues, "unknown_field_ignores_available_evidence", [
            ...path,
            "effectiveProfiles",
            profileIndex,
            "fields",
            fieldName,
          ]);
        }
        continue;
      }
      const claimIds = Array.isArray(field.claimIds)
        ? field.claimIds.filter((item): item is string => typeof item === "string")
        : [];
      for (const claimId of claimIds) {
        referencedFieldClaimIds.add(claimId);
        if (!inputClaimIds.includes(claimId)) {
          addContractIssue(issues, "field_claim_missing_from_profile_inputs", [
            ...path,
            "effectiveProfiles",
            profileIndex,
            "fields",
            fieldName,
            "claimIds",
          ]);
        }
      }
      if (expectedBasis === null) {
        addContractIssue(issues, "known_field_requires_eligible_evidence", [
          ...path,
          "effectiveProfiles",
          profileIndex,
          "fields",
          fieldName,
        ]);
      } else if (field.basis !== expectedBasis) {
        addContractIssue(issues, "effective_field_basis_mismatch", [
          ...path,
          "effectiveProfiles",
          profileIndex,
          "fields",
          fieldName,
          "basis",
        ]);
      }
      if (!contractValuesEqual(claimIds, expectedClaimIds)) {
        addContractIssue(issues, "effective_field_claim_ids_mismatch", [
          ...path,
          "effectiveProfiles",
          profileIndex,
          "fields",
          fieldName,
          "claimIds",
        ]);
      }
      if (claimIds.some((claimId) => !expectedClaimIds.includes(claimId))) {
        addContractIssue(issues, "effective_field_references_ineligible_claim", [
          ...path,
          "effectiveProfiles",
          profileIndex,
          "fields",
          fieldName,
          "claimIds",
        ]);
      }
      const effectiveValuePath = [
        ...path,
        "effectiveProfiles",
        profileIndex,
        "fields",
        fieldName,
        "value",
      ];
      const derivedValue = expectedEffectiveValue(
        fieldName,
        selectedClaims,
        issues,
        effectiveValuePath,
      );
      if (!contractValuesEqual(field.value, derivedValue)) {
        addContractIssue(
          issues,
          "effective_field_value_mismatch",
          effectiveValuePath,
        );
      }
      const derivedProvenance = expectedEffectiveProvenance(selectedClaims);
      if (!contractValuesEqual(field.provenance, derivedProvenance)) {
        addContractIssue(issues, "effective_field_provenance_mismatch", [
          ...path,
          "effectiveProfiles",
          profileIndex,
          "fields",
          fieldName,
          "provenance",
        ]);
      }
      const referencedClaims = claimIds
        .map((claimId) => allClaimsById.get(claimId))
        .filter((claim): claim is Readonly<Record<string, unknown>> => claim !== undefined);
      for (const claim of referencedClaims) {
        if (!isContractRecord(claim.claim) || claimFieldName(claim.claim) !== fieldName) {
          addContractIssue(issues, "effective_field_claim_kind_mismatch", [
            ...path,
            "effectiveProfiles",
            profileIndex,
            "fields",
            fieldName,
          ]);
        }
      }
      if (field.basis === "culinary_baseline") {
        if (menuFieldClaims.length > 0) {
          addContractIssue(issues, "baseline_cannot_override_menu_evidence", [
            ...path,
            "effectiveProfiles",
            profileIndex,
            "fields",
            fieldName,
          ]);
        }
        for (const claim of referencedClaims) {
          if (
            claim.basis !== "culinary_baseline" ||
            claim.reviewState !== "reviewed" ||
            claim.dishId !== profile.dishId
          ) {
            addContractIssue(issues, "baseline_requires_reviewed_dish_claim", [
              ...path,
              "effectiveProfiles",
              profileIndex,
              "fields",
              fieldName,
            ]);
          }
        }
      } else {
        if (
          field.basis === "inferred_from_source" &&
          menuFieldClaims.some((claim) => claim.basis === "source_stated")
        ) {
          addContractIssue(issues, "inference_cannot_override_source_statement", [
            ...path,
            "effectiveProfiles",
            profileIndex,
            "fields",
            fieldName,
          ]);
        }
        for (const claim of referencedClaims) {
          if (
            claim.basis !== field.basis ||
            claim.menuItemId !== profile.menuItemId
          ) {
            addContractIssue(issues, "menu_evidence_basis_mismatch", [
              ...path,
              "effectiveProfiles",
              profileIndex,
              "fields",
              fieldName,
            ]);
          }
        }
      }
    }
    if (!contractValuesEqual(inputClaimIds, expectedInputClaimIds)) {
      addContractIssue(issues, "effective_profile_input_claim_ids_mismatch", [
        ...path,
        "effectiveProfiles",
        profileIndex,
        "inputClaimIds",
      ]);
    }
    if (
      inputClaimIds.some((claimId) => !referencedFieldClaimIds.has(claimId))
    ) {
      addContractIssue(issues, "profile_input_claim_is_not_used", [
        ...path,
        "effectiveProfiles",
        profileIndex,
        "inputClaimIds",
      ]);
    }
  }
};

const validateCanonicalMenuAnalysis = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
) => {
  if (
    !validateRecord(
      value,
      [
        "contractVersion",
        "analysisId",
        "source",
        "restaurantResolution",
        "publicationState",
        "menuVersion",
        "menuItems",
        "dishCandidates",
        "dishMatches",
        "menuItemClaims",
        "dishClaims",
        "effectiveProfiles",
        "warningCodes",
        "validatedAt",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateVersion(
    value.contractVersion,
    CONTRACT_VERSIONS.boundaryDtos,
    issues,
    [...path, "contractVersion"],
  );
  validateUuid(value.analysisId, issues, [...path, "analysisId"]);
  validateSafeSourceReference(value.source, issues, [...path, "source"]);
  validateRestaurantResolution(value.restaurantResolution, issues, [
    ...path,
    "restaurantResolution",
  ]);
  validateEnumValue(
    value.publicationState,
    CANONICAL_PUBLICATION_STATES,
    issues,
    [...path, "publicationState"],
  );
  if (value.menuVersion !== null) {
    validateRestaurantMenuVersion(value.menuVersion, issues, [
      ...path,
      "menuVersion",
    ]);
  }
  validateArray(
    value.menuItems,
    issues,
    [...path, "menuItems"],
    validateMenuItem,
    { minLength: 1, maxLength: 5000 },
  );
  validateArray(
    value.dishCandidates,
    issues,
    [...path, "dishCandidates"],
    validateDishCandidate,
    { maxLength: 10000 },
  );
  validateArray(
    value.dishMatches,
    issues,
    [...path, "dishMatches"],
    validateMenuItemDishMatch,
    { maxLength: 20000 },
  );
  validateArray(
    value.menuItemClaims,
    issues,
    [...path, "menuItemClaims"],
    validateMenuItemClaim,
    { maxLength: 50000 },
  );
  validateArray(
    value.dishClaims,
    issues,
    [...path, "dishClaims"],
    validateDishClaim,
    { maxLength: 50000 },
  );
  validateArray(
    value.effectiveProfiles,
    issues,
    [...path, "effectiveProfiles"],
    validateEffectiveDishProfile,
    { maxLength: 10000 },
  );
  validateArray(
    value.warningCodes,
    issues,
    [...path, "warningCodes"],
    (item, itemIssues, itemPath) => {
      validateEnumValue(
        item,
        EXTRACTION_WARNING_CODES,
        itemIssues,
        itemPath,
      );
    },
    { maxLength: EXTRACTION_WARNING_CODES.length },
  );
  validateUniqueStrings(value.warningCodes, issues, [...path, "warningCodes"]);
  validateUtcTimestamp(value.validatedAt, issues, [...path, "validatedAt"]);
  validateCanonicalRelationships(value, issues, path);
};

const validatePublicOutcome = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
) => {
  if (
    !validateRecord(
      value,
      [
        "code",
        "stage",
        "correlationId",
        "retryable",
        "canContinueMenuOnly",
      ],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateEnumValue(value.code, PUBLIC_OUTCOME_CODES, issues, [...path, "code"]);
  validateEnumValue(value.stage, WORKFLOW_STAGES, issues, [...path, "stage"]);
  validateString(value.correlationId, issues, [...path, "correlationId"], {
    pattern: CORRELATION_ID_PATTERN,
  });
  validateBoolean(value.retryable, issues, [...path, "retryable"]);
  validateBoolean(value.canContinueMenuOnly, issues, [
    ...path,
    "canContinueMenuOnly",
  ]);
};

const validatePublicErrorEnvelope = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
) => {
  if (!validateRecord(value, ["error", "httpStatus"], [], issues, path)) {
    return;
  }
  if (
    !validateRecord(
      value.error,
      ["code", "message", "correlationId", "retryable"],
      [],
      issues,
      [...path, "error"],
    )
  ) {
    return;
  }
  const codeIsValid = validateEnumValue(
    value.error.code,
    PUBLIC_ERROR_CODES,
    issues,
    [...path, "error", "code"],
  );
  validateString(value.error.message, issues, [...path, "error", "message"], {
    minLength: 1,
    maxLength: 160,
  });
  validateString(
    value.error.correlationId,
    issues,
    [...path, "error", "correlationId"],
    { pattern: CORRELATION_ID_PATTERN },
  );
  validateBoolean(value.error.retryable, issues, [
    ...path,
    "error",
    "retryable",
  ]);
  validateInteger(value.httpStatus, issues, [...path, "httpStatus"], {
    minimum: 400,
    maximum: 599,
  });
  if (codeIsValid) {
    const errorCode = value.error.code as PublicErrorCode;
    const expected = PUBLIC_ERROR_REGISTRY[errorCode];
    if (
      value.error.message !== expected.message ||
      value.error.retryable !== expected.retryable ||
      value.httpStatus !== expected.httpStatus
    ) {
      addContractIssue(issues, "public_error_definition_mismatch", path);
    }
  }
};

export const RestaurantCandidateSchema =
  createRuntimeSchema<RestaurantCandidate>(
    "RestaurantCandidate",
    validateRestaurantCandidate,
  );

export const RestaurantResolutionSchema =
  createRuntimeSchema<RestaurantResolution>(
    "RestaurantResolution",
    validateRestaurantResolution,
  );

export const MenuSourceInputSchema = createRuntimeSchema<MenuSourceInput>(
  "MenuSourceInput",
  validateMenuSourceInput,
);

export const CompactMenuExtractionSchema =
  createRuntimeSchema<CompactMenuExtraction>(
    "CompactMenuExtraction",
    validateCompactMenuExtraction,
  );

export const DishCandidateSchema = createRuntimeSchema<DishCandidate>(
  "DishCandidate",
  validateDishCandidate,
);

export const EffectiveDishProfileSchema =
  createRuntimeSchema<EffectiveDishProfile>(
    "EffectiveDishProfile",
    validateEffectiveDishProfile,
  );

export const CanonicalMenuAnalysisSchema =
  createRuntimeSchema<CanonicalMenuAnalysis>(
    "CanonicalMenuAnalysis",
    validateCanonicalMenuAnalysis,
  );

export const PublicOutcomeSchema = createRuntimeSchema<PublicOutcome>(
  "PublicOutcome",
  validatePublicOutcome,
);

export const PublicErrorEnvelopeSchema =
  createRuntimeSchema<PublicErrorEnvelope>(
    "PublicErrorEnvelope",
    validatePublicErrorEnvelope,
  );

export const BOUNDARY_DTO_SCHEMAS = {
  RestaurantCandidate: RestaurantCandidateSchema,
  RestaurantResolution: RestaurantResolutionSchema,
  MenuSourceInput: MenuSourceInputSchema,
  CompactMenuExtraction: CompactMenuExtractionSchema,
  CanonicalMenuAnalysis: CanonicalMenuAnalysisSchema,
  DishCandidate: DishCandidateSchema,
  EffectiveDishProfile: EffectiveDishProfileSchema,
  PublicOutcome: PublicOutcomeSchema,
  PublicErrorEnvelope: PublicErrorEnvelopeSchema,
} as const;

export type BoundaryDtoSchemaName = keyof typeof BOUNDARY_DTO_SCHEMAS;
