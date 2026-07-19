import {
  CanonicalMenuAnalysisSchema,
  CompactMenuExtractionSchema,
  DishCandidateSchema,
  DishClaimSchema,
  EffectiveDishProfileSchema,
  MenuItemClaimSchema,
  MenuItemDishMatchSchema,
  MenuSourceInputSchema,
  PUBLIC_ERROR_CODES,
  PUBLIC_OUTCOME_CODES,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  RestaurantCandidateSchema,
  RestaurantConfirmationEvidenceSchema,
  RestaurantResolutionSchema,
  TransientMenuContentSchema,
  WORKFLOW_STAGES,
  type CanonicalMenuAnalysis,
  type CompactMenuExtraction,
  type DishCandidate,
  type DishClaim,
  type EffectiveDishProfile,
  type MenuItemClaim,
  type MenuItemDishMatch,
  type MenuSourceInput,
  type PublicErrorEnvelope,
  type PublicErrorCode,
  type PublicOutcome,
  type PublicOutcomeCode,
  type RestaurantCandidate,
  type RestaurantConfirmationEvidence,
  type RestaurantMenuVersion,
  type RestaurantResolution,
  type TransientMenuContent,
  type WorkflowStage,
} from "./boundary-dtos.js";
import {
  addContractIssue,
  createRuntimeSchema,
  isContractRecord,
  validateArray,
  validateEnumValue,
  validateFiniteNumber,
  validateInteger,
  validateLiteral,
  validateNullableString,
  validateRecord,
  validateString,
  type ContractPathSegment,
  type ContractValidationIssue,
  type RuntimeContractSchema,
  type SafeParseResult,
} from "./runtime-schema.js";
import {
  MENU_SCOPES,
  type MenuScope,
} from "./vocabulary.js";
import { CONTRACT_VERSIONS } from "./versions.js";

export const MODULE_INTERFACE_VERSION =
  CONTRACT_VERSIONS.moduleInterfaces;

export type ModuleInterfaceVersion = typeof MODULE_INTERFACE_VERSION;

export interface PortInvocationContext {
  readonly contractVersion: ModuleInterfaceVersion;
  readonly correlationId: string;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}

export interface PortSuccessResult<T> {
  readonly status: "success";
  readonly value: T;
}

export interface PortOutcomeResult {
  readonly status: "outcome";
  readonly outcome: PublicOutcome;
}

export interface PortErrorResult {
  readonly status: "error";
  readonly error: PublicErrorEnvelope;
}

export type PortResult<T> =
  | PortSuccessResult<T>
  | PortOutcomeResult
  | PortErrorResult;

export interface DeterministicFakePlan<T> {
  readonly defaultResult: PortResult<T>;
  readonly abortedResult: PortOutcomeResult;
  readonly timedOutResult: PortErrorResult;
}

export const selectDeterministicFakeResult = <T>(
  context: PortInvocationContext,
  plan: DeterministicFakePlan<T>,
): PortResult<T> => {
  PortInvocationContextSchema.parse(context);

  if (context.signal.aborted) {
    return isTimeoutAbortSignal(context.signal)
      ? plan.timedOutResult
      : plan.abortedResult;
  }

  return plan.defaultResult;
};

export interface RestaurantResolutionRequest {
  readonly candidates: readonly RestaurantCandidate[];
  readonly priorResolution: RestaurantResolution | null;
  readonly selectedCandidateId: string | null;
  readonly confirmationEvidence: RestaurantConfirmationEvidence | null;
}

export interface RestaurantResolutionPort {
  resolve(
    request: RestaurantResolutionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<RestaurantResolution>>;
}

export type UiSafeOperationalEvent =
  | RestaurantResolution
  | PublicOutcome
  | PublicErrorEnvelope;

export interface UiOperationalEventPort {
  emit(
    event: UiSafeOperationalEvent,
    context: PortInvocationContext,
  ): Promise<void>;
}

export interface MenuSourceAcquisitionRequest {
  readonly restaurantResolution: RestaurantResolution;
  readonly menuScope: MenuScope;
  readonly submissionContent: readonly TransientMenuContent[];
  readonly requestedAt: string;
}

export interface MenuSourceAcquisitionPort {
  acquire(
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuSourceInput>>;
}

export interface CompactMenuExtractionPort {
  extract(
    input: MenuSourceInput,
    context: PortInvocationContext,
  ): Promise<PortResult<CompactMenuExtraction>>;
}

export interface CanonicalValidationRequest {
  readonly extraction: CompactMenuExtraction;
  readonly restaurantResolution: RestaurantResolution;
}

export interface CanonicalMenuValidationPort {
  validate(
    request: CanonicalValidationRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<CanonicalMenuAnalysis>>;
}

export type ReviewedDishClaim = DishClaim & {
  readonly reviewState: "reviewed";
  readonly reviewedAt: string;
};

export interface DishKnowledgeRequest {
  readonly candidates: readonly DishCandidate[];
}

export interface DishKnowledgeResult {
  readonly claims: readonly ReviewedDishClaim[];
}

export interface DishKnowledgePort {
  findReviewedClaims(
    request: DishKnowledgeRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<DishKnowledgeResult>>;
}

export interface EffectiveProfileMergeRequest {
  readonly matches: readonly MenuItemDishMatch[];
  readonly menuItemClaims: readonly MenuItemClaim[];
  readonly dishClaims: readonly ReviewedDishClaim[];
}

export interface EffectiveProfileMergeResult {
  readonly profiles: readonly EffectiveDishProfile[];
}

export interface EffectiveProfileMergePort {
  merge(
    request: EffectiveProfileMergeRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<EffectiveProfileMergeResult>>;
}

export interface ConstrainedExplanationBlock {
  readonly scope: "analysis" | "menu_item";
  readonly menuItemId: string | null;
  readonly text: string;
}

export interface ConstrainedExplanation {
  readonly contractVersion: ModuleInterfaceVersion;
  readonly analysisId: string;
  readonly rendererVersion: typeof CONTRACT_VERSIONS.explanationRenderer;
  readonly blocks: readonly ConstrainedExplanationBlock[];
  readonly renderedAt: string;
}

export interface ConstrainedExplanationPort {
  render(
    analysis: CanonicalMenuAnalysis,
    context: PortInvocationContext,
  ): Promise<PortResult<ConstrainedExplanation>>;
}

export type PublicationEligibleAnalysis = CanonicalMenuAnalysis & {
  readonly publicationState: "eligible";
  readonly menuVersion: RestaurantMenuVersion;
};

export const isPublicationEligibleAnalysis = (
  analysis: CanonicalMenuAnalysis,
): analysis is PublicationEligibleAnalysis =>
  analysis.publicationState === "eligible" && analysis.menuVersion !== null;

export interface PublicationReceipt {
  readonly contractVersion: ModuleInterfaceVersion;
  readonly analysisId: string;
  readonly menuVersionId: string;
  readonly status: "published";
  readonly publishedAt: string;
}

export interface AnalysisPublicationPort {
  publish(
    analysis: PublicationEligibleAnalysis,
    context: PortInvocationContext,
  ): Promise<PortResult<PublicationReceipt>>;
}

export interface AnalysisWorkflowRequest {
  readonly menuSource: MenuSourceInput;
  readonly restaurantResolution: RestaurantResolution;
}

export interface AnalysisApplicationResult {
  readonly analysis: CanonicalMenuAnalysis;
  readonly explanation: ConstrainedExplanation;
  readonly publication: PublicationReceipt | null;
}

export interface AnalysisWorkflowPort {
  run(
    request: AnalysisWorkflowRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<AnalysisApplicationResult>>;
}

export type SafeObservabilityStatus =
  | {
      readonly kind: "success";
    }
  | {
      readonly kind: "outcome";
      readonly code: PublicOutcomeCode;
    }
  | {
      readonly kind: "error";
      readonly code: PublicErrorCode;
    };

export interface SafeObservabilityEvent {
  readonly correlationId: string;
  readonly stage: WorkflowStage;
  readonly status: SafeObservabilityStatus;
  readonly durationMs: number | null;
  readonly byteCount: number | null;
  readonly providerCallCount: number | null;
  readonly structuralIssueCount: number | null;
}

export interface SafeObservabilityPort {
  emit(
    event: SafeObservabilityEvent,
    context: PortInvocationContext,
  ): Promise<void>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

const appendSchemaIssues = <T>(
  result: SafeParseResult<T>,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (result.success) {
    return;
  }
  for (const issue of result.issues) {
    addContractIssue(issues, issue.code, [...path, ...issue.path]);
  }
};

const validateSchema = <T>(
  schema: RuntimeContractSchema<T>,
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  appendSchemaIssues(schema.safeParse(value), issues, path);
};

const validateNullableSchema = <T>(
  schema: RuntimeContractSchema<T>,
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (value !== null) {
    validateSchema(schema, value, issues, path);
  }
};

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

const validateInvocationContext = (
  value: unknown,
  issues: ContractValidationIssue[],
) => {
  const path = ["invocationContext"] as const;
  if (
    !validateRecord(
      value,
      ["contractVersion", "correlationId", "timeoutMs", "signal"],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validateLiteral(
    value.contractVersion,
    MODULE_INTERFACE_VERSION,
    issues,
    [...path, "contractVersion"],
  );
  validateString(value.correlationId, issues, [...path, "correlationId"], {
    minLength: 8,
    maxLength: 64,
    pattern: CORRELATION_ID_PATTERN,
  });
  if (
    typeof value.timeoutMs !== "number" ||
    !Number.isSafeInteger(value.timeoutMs) ||
    value.timeoutMs <= 0
  ) {
    addContractIssue(issues, "invalid_invocation_timeout", [
      ...path,
      "timeoutMs",
    ]);
  }
  if (
    typeof AbortSignal === "undefined" ||
    !(value.signal instanceof AbortSignal)
  ) {
    addContractIssue(issues, "invalid_abort_signal", [...path, "signal"]);
  }
};

export const PortInvocationContextSchema =
  createRuntimeSchema<PortInvocationContext>(
    "PortInvocationContext",
    validateInvocationContext,
  );

export const isTimeoutAbortSignal = (signal: AbortSignal): boolean =>
  signal.aborted &&
  isContractRecord(signal.reason) &&
  signal.reason.name === "TimeoutError";

export const canRecordDeterministicEvent = (
  context: PortInvocationContext,
): boolean => {
  PortInvocationContextSchema.parse(context);
  return !context.signal.aborted;
};

const validatePortResult = <T>(
  value: unknown,
  successSchema: RuntimeContractSchema<T>,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (!isContractRecord(value) || typeof value.status !== "string") {
    addContractIssue(issues, "invalid_port_result", [...path, "status"]);
    return;
  }
  if (value.status === "success") {
    if (validateRecord(value, ["status", "value"], [], issues, path)) {
      validateSchema(successSchema, value.value, issues, [...path, "value"]);
    }
    return;
  }
  if (value.status === "outcome") {
    if (validateRecord(value, ["status", "outcome"], [], issues, path)) {
      validateSchema(
        PublicOutcomeSchema,
        value.outcome,
        issues,
        [...path, "outcome"],
      );
    }
    return;
  }
  if (value.status === "error") {
    if (validateRecord(value, ["status", "error"], [], issues, path)) {
      validateSchema(
        PublicErrorEnvelopeSchema,
        value.error,
        issues,
        [...path, "error"],
      );
    }
    return;
  }
  addContractIssue(issues, "invalid_port_result", [...path, "status"]);
};

const validateDeterministicFakePlan = <T>(
  value: unknown,
  successSchema: RuntimeContractSchema<T>,
  issues: ContractValidationIssue[],
) => {
  const path = ["plan"] as const;
  if (
    !validateRecord(
      value,
      ["defaultResult", "abortedResult", "timedOutResult"],
      [],
      issues,
      path,
    )
  ) {
    return;
  }
  validatePortResult(
    value.defaultResult,
    successSchema,
    issues,
    [...path, "defaultResult"],
  );

  if (
    !isContractRecord(value.abortedResult) ||
    value.abortedResult.status !== "outcome"
  ) {
    addContractIssue(issues, "invalid_aborted_fake_result", [
      ...path,
      "abortedResult",
      "status",
    ]);
  } else if (
    validateRecord(
      value.abortedResult,
      ["status", "outcome"],
      [],
      issues,
      [...path, "abortedResult"],
    )
  ) {
    validateSchema(
      PublicOutcomeSchema,
      value.abortedResult.outcome,
      issues,
      [...path, "abortedResult", "outcome"],
    );
  }

  if (
    !isContractRecord(value.timedOutResult) ||
    value.timedOutResult.status !== "error"
  ) {
    addContractIssue(issues, "invalid_timed_out_fake_result", [
      ...path,
      "timedOutResult",
      "status",
    ]);
    return;
  }
  if (
    validateRecord(
      value.timedOutResult,
      ["status", "error"],
      [],
      issues,
      [...path, "timedOutResult"],
    )
  ) {
    const errorResult = PublicErrorEnvelopeSchema.safeParse(
      value.timedOutResult.error,
    );
    appendSchemaIssues(
      errorResult,
      issues,
      [...path, "timedOutResult", "error"],
    );
    if (
      errorResult.success &&
      errorResult.data.error.code !== "UPSTREAM_TIMEOUT"
    ) {
      addContractIssue(issues, "invalid_timed_out_fake_error", [
        ...path,
        "timedOutResult",
        "error",
        "error",
        "code",
      ]);
    }
  }
};

export const parseDeterministicFakePlan = <T>(
  value: unknown,
  successSchema: RuntimeContractSchema<T>,
): DeterministicFakePlan<T> =>
  createRuntimeSchema<DeterministicFakePlan<T>>(
    `DeterministicFakePlan<${successSchema.name}>`,
    (candidate, issues) => {
      validateDeterministicFakePlan(candidate, successSchema, issues);
    },
  ).parse(value);

const validateRestaurantResolutionRequest = (
  value: unknown,
  issues: ContractValidationIssue[],
) => {
  if (
    !validateRecord(
      value,
      [
        "candidates",
        "priorResolution",
        "selectedCandidateId",
        "confirmationEvidence",
      ],
      [],
      issues,
    )
  ) {
    return;
  }
  validateArray(
    value.candidates,
    issues,
    ["candidates"],
    (item, itemIssues, itemPath) => {
      validateSchema(RestaurantCandidateSchema, item, itemIssues, itemPath);
    },
  );
  validateNullableSchema(
    RestaurantResolutionSchema,
    value.priorResolution,
    issues,
    ["priorResolution"],
  );
  validateNullableString(value.selectedCandidateId, issues, [
    "selectedCandidateId",
  ], { pattern: UUID_PATTERN });
  validateNullableSchema(
    RestaurantConfirmationEvidenceSchema,
    value.confirmationEvidence,
    issues,
    ["confirmationEvidence"],
  );
};

export const RestaurantResolutionRequestSchema =
  createRuntimeSchema<RestaurantResolutionRequest>(
    "RestaurantResolutionRequest",
    validateRestaurantResolutionRequest,
  );

const validateMenuSourceAcquisitionRequest = (
  value: unknown,
  issues: ContractValidationIssue[],
) => {
  if (
    !validateRecord(
      value,
      [
        "restaurantResolution",
        "menuScope",
        "submissionContent",
        "requestedAt",
      ],
      [],
      issues,
    )
  ) {
    return;
  }
  validateSchema(
    RestaurantResolutionSchema,
    value.restaurantResolution,
    issues,
    ["restaurantResolution"],
  );
  validateEnumValue(value.menuScope, MENU_SCOPES, issues, ["menuScope"]);
  validateArray(
    value.submissionContent,
    issues,
    ["submissionContent"],
    (item, itemIssues, itemPath) => {
      validateSchema(TransientMenuContentSchema, item, itemIssues, itemPath);
    },
    { minLength: 1, maxLength: 32 },
  );
  validateUtcTimestamp(value.requestedAt, issues, ["requestedAt"]);
};

export const MenuSourceAcquisitionRequestSchema =
  createRuntimeSchema<MenuSourceAcquisitionRequest>(
    "MenuSourceAcquisitionRequest",
    validateMenuSourceAcquisitionRequest,
  );

export const CanonicalValidationRequestSchema =
  createRuntimeSchema<CanonicalValidationRequest>(
    "CanonicalValidationRequest",
    (value, issues) => {
      if (!validateRecord(value, ["extraction", "restaurantResolution"], [], issues)) {
        return;
      }
      validateSchema(
        CompactMenuExtractionSchema,
        value.extraction,
        issues,
        ["extraction"],
      );
      validateSchema(
        RestaurantResolutionSchema,
        value.restaurantResolution,
        issues,
        ["restaurantResolution"],
      );
    },
  );

export const DishKnowledgeRequestSchema =
  createRuntimeSchema<DishKnowledgeRequest>(
    "DishKnowledgeRequest",
    (value, issues) => {
      if (!validateRecord(value, ["candidates"], [], issues)) {
        return;
      }
      validateArray(
        value.candidates,
        issues,
        ["candidates"],
        (item, itemIssues, itemPath) => {
          validateSchema(DishCandidateSchema, item, itemIssues, itemPath);
        },
      );
    },
  );

export const DishKnowledgeResultSchema =
  createRuntimeSchema<DishKnowledgeResult>(
    "DishKnowledgeResult",
    (value, issues) => {
      if (!validateRecord(value, ["claims"], [], issues)) {
        return;
      }
      validateArray(
        value.claims,
        issues,
        ["claims"],
        (item, itemIssues, itemPath) => {
          const result = DishClaimSchema.safeParse(item);
          appendSchemaIssues(result, itemIssues, itemPath);
          if (result.success && result.data.reviewState !== "reviewed") {
            addContractIssue(itemIssues, "dish_claim_not_reviewed", [
              ...itemPath,
              "reviewState",
            ]);
          }
        },
      );
    },
  );

export const EffectiveProfileMergeRequestSchema =
  createRuntimeSchema<EffectiveProfileMergeRequest>(
    "EffectiveProfileMergeRequest",
    (value, issues) => {
      if (
        !validateRecord(
          value,
          ["matches", "menuItemClaims", "dishClaims"],
          [],
          issues,
        )
      ) {
        return;
      }
      validateArray(value.matches, issues, ["matches"], (item, itemIssues, itemPath) => {
        validateSchema(MenuItemDishMatchSchema, item, itemIssues, itemPath);
      });
      validateArray(
        value.menuItemClaims,
        issues,
        ["menuItemClaims"],
        (item, itemIssues, itemPath) => {
          validateSchema(MenuItemClaimSchema, item, itemIssues, itemPath);
        },
      );
      validateArray(
        value.dishClaims,
        issues,
        ["dishClaims"],
        (item, itemIssues, itemPath) => {
          const result = DishClaimSchema.safeParse(item);
          appendSchemaIssues(result, itemIssues, itemPath);
          if (result.success && result.data.reviewState !== "reviewed") {
            addContractIssue(itemIssues, "dish_claim_not_reviewed", [
              ...itemPath,
              "reviewState",
            ]);
          }
        },
      );
    },
  );

export const EffectiveProfileMergeResultSchema =
  createRuntimeSchema<EffectiveProfileMergeResult>(
    "EffectiveProfileMergeResult",
    (value, issues) => {
      if (!validateRecord(value, ["profiles"], [], issues)) {
        return;
      }
      validateArray(
        value.profiles,
        issues,
        ["profiles"],
        (item, itemIssues, itemPath) => {
          validateSchema(EffectiveDishProfileSchema, item, itemIssues, itemPath);
        },
      );
    },
  );

export const ConstrainedExplanationSchema =
  createRuntimeSchema<ConstrainedExplanation>(
    "ConstrainedExplanation",
    (value, issues) => {
      if (
        !validateRecord(
          value,
          [
            "contractVersion",
            "analysisId",
            "rendererVersion",
            "blocks",
            "renderedAt",
          ],
          [],
          issues,
        )
      ) {
        return;
      }
      validateLiteral(
        value.contractVersion,
        MODULE_INTERFACE_VERSION,
        issues,
        ["contractVersion"],
      );
      validateString(value.analysisId, issues, ["analysisId"], {
        pattern: UUID_PATTERN,
      });
      validateLiteral(
        value.rendererVersion,
        CONTRACT_VERSIONS.explanationRenderer,
        issues,
        ["rendererVersion"],
      );
      validateArray(
        value.blocks,
        issues,
        ["blocks"],
        (item, itemIssues, itemPath) => {
          if (
            !validateRecord(
              item,
              ["scope", "menuItemId", "text"],
              [],
              itemIssues,
              itemPath,
            )
          ) {
            return;
          }
          validateEnumValue(
            item.scope,
            ["analysis", "menu_item"] as const,
            itemIssues,
            [...itemPath, "scope"],
          );
          validateNullableString(
            item.menuItemId,
            itemIssues,
            [...itemPath, "menuItemId"],
            { pattern: UUID_PATTERN },
          );
          validateString(item.text, itemIssues, [...itemPath, "text"], {
            minLength: 1,
            maxLength: 4000,
          });
          if (
            (item.scope === "analysis" && item.menuItemId !== null) ||
            (item.scope === "menu_item" &&
              typeof item.menuItemId !== "string")
          ) {
            addContractIssue(itemIssues, "invalid_explanation_block_scope", itemPath);
          }
        },
      );
      validateUtcTimestamp(value.renderedAt, issues, ["renderedAt"]);
    },
  );

export const PublicationEligibleAnalysisSchema =
  createRuntimeSchema<PublicationEligibleAnalysis>(
    "PublicationEligibleAnalysis",
    (value, issues) => {
      validateSchema(CanonicalMenuAnalysisSchema, value, issues, ["analysis"]);
      if (!isContractRecord(value) || value.publicationState !== "eligible") {
        addContractIssue(issues, "publication_not_eligible", [
          "analysis",
          "publicationState",
        ]);
      }
      if (!isContractRecord(value) || value.menuVersion === null) {
        addContractIssue(issues, "publication_not_eligible", [
          "analysis",
          "menuVersion",
        ]);
      }
    },
  );

export const PublicationReceiptSchema =
  createRuntimeSchema<PublicationReceipt>(
    "PublicationReceipt",
    (value, issues) => {
      if (
        !validateRecord(
          value,
          [
            "contractVersion",
            "analysisId",
            "menuVersionId",
            "status",
            "publishedAt",
          ],
          [],
          issues,
        )
      ) {
        return;
      }
      validateLiteral(
        value.contractVersion,
        MODULE_INTERFACE_VERSION,
        issues,
        ["contractVersion"],
      );
      validateString(value.analysisId, issues, ["analysisId"], {
        pattern: UUID_PATTERN,
      });
      validateString(value.menuVersionId, issues, ["menuVersionId"], {
        pattern: UUID_PATTERN,
      });
      validateLiteral(value.status, "published", issues, ["status"]);
      validateUtcTimestamp(value.publishedAt, issues, ["publishedAt"]);
    },
  );

export const AnalysisWorkflowRequestSchema =
  createRuntimeSchema<AnalysisWorkflowRequest>(
    "AnalysisWorkflowRequest",
    (value, issues) => {
      if (!validateRecord(value, ["menuSource", "restaurantResolution"], [], issues)) {
        return;
      }
      validateSchema(MenuSourceInputSchema, value.menuSource, issues, ["menuSource"]);
      validateSchema(
        RestaurantResolutionSchema,
        value.restaurantResolution,
        issues,
        ["restaurantResolution"],
      );
    },
  );

export const AnalysisApplicationResultSchema =
  createRuntimeSchema<AnalysisApplicationResult>(
    "AnalysisApplicationResult",
    (value, issues) => {
      if (!validateRecord(value, ["analysis", "explanation", "publication"], [], issues)) {
        return;
      }
      validateSchema(
        CanonicalMenuAnalysisSchema,
        value.analysis,
        issues,
        ["analysis"],
      );
      validateSchema(
        ConstrainedExplanationSchema,
        value.explanation,
        issues,
        ["explanation"],
      );
      validateNullableSchema(
        PublicationReceiptSchema,
        value.publication,
        issues,
        ["publication"],
      );
    },
  );

export const UiSafeOperationalEventSchema =
  createRuntimeSchema<UiSafeOperationalEvent>(
    "UiSafeOperationalEvent",
    (value, issues) => {
      const candidates = [
        RestaurantResolutionSchema.safeParse(value),
        PublicOutcomeSchema.safeParse(value),
        PublicErrorEnvelopeSchema.safeParse(value),
      ];
      if (!candidates.some((candidate) => candidate.success)) {
        addContractIssue(issues, "invalid_ui_operational_event", [
          "uiOperationalEvent",
        ]);
      }
    },
  );

const validateSafeObservabilityEvent = (
  value: unknown,
  issues: ContractValidationIssue[],
) => {
  const path = ["observabilityEvent"] as const;
  if (!isContractRecord(value)) {
    addContractIssue(issues, "expected_object", path);
    return;
  }
  const requiredKeys = [
    "correlationId",
    "stage",
    "status",
    "durationMs",
    "byteCount",
    "providerCallCount",
    "structuralIssueCount",
  ] as const;
  const allowedKeys = new Set<string>(requiredKeys);
  for (const key of requiredKeys) {
    if (!(key in value)) {
      addContractIssue(issues, "missing_required_field", [...path, key]);
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      addContractIssue(issues, "unsafe_observability_field", [...path, key]);
    }
  }
  validateString(value.correlationId, issues, [...path, "correlationId"], {
    minLength: 8,
    maxLength: 64,
    pattern: CORRELATION_ID_PATTERN,
  });
  validateEnumValue(value.stage, WORKFLOW_STAGES, issues, [...path, "stage"]);
  if (!isContractRecord(value.status)) {
    addContractIssue(issues, "expected_object", [...path, "status"]);
  } else if (value.status.kind === "success") {
    validateRecord(value.status, ["kind"], [], issues, [...path, "status"]);
  } else if (value.status.kind === "outcome") {
    if (
      validateRecord(
        value.status,
        ["kind", "code"],
        [],
        issues,
        [...path, "status"],
      )
    ) {
      validateEnumValue(
        value.status.code,
        PUBLIC_OUTCOME_CODES,
        issues,
        [...path, "status", "code"],
      );
    }
  } else if (value.status.kind === "error") {
    if (
      validateRecord(
        value.status,
        ["kind", "code"],
        [],
        issues,
        [...path, "status"],
      )
    ) {
      validateEnumValue(
        value.status.code,
        PUBLIC_ERROR_CODES,
        issues,
        [...path, "status", "code"],
      );
    }
  } else {
    addContractIssue(issues, "invalid_observability_status", [
      ...path,
      "status",
      "kind",
    ]);
  }
  const nullableCounts = [
    "durationMs",
    "byteCount",
    "providerCallCount",
    "structuralIssueCount",
  ] as const;
  for (const key of nullableCounts) {
    if (value[key] !== null) {
      if (key === "durationMs") {
        validateFiniteNumber(value[key], issues, [...path, key], { minimum: 0 });
      } else {
        validateInteger(value[key], issues, [...path, key], { minimum: 0 });
      }
    }
  }
};

export const SafeObservabilityEventSchema =
  createRuntimeSchema<SafeObservabilityEvent>(
    "SafeObservabilityEvent",
    validateSafeObservabilityEvent,
  );
