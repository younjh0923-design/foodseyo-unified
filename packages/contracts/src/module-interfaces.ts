import type {
  CanonicalMenuAnalysis,
  CompactMenuExtraction,
  DishCandidate,
  DishClaim,
  EffectiveDishProfile,
  MenuItemClaim,
  MenuItemDishMatch,
  MenuSourceInput,
  PublicErrorEnvelope,
  PublicErrorCode,
  PublicOutcome,
  PublicOutcomeCode,
  RestaurantCandidate,
  RestaurantConfirmationEvidence,
  RestaurantMenuVersion,
  RestaurantResolution,
  TransientMenuContent,
  WorkflowStage,
} from "./boundary-dtos.js";
import type { MenuScope } from "./vocabulary.js";
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

export type PortResult<T> =
  | {
      readonly status: "success";
      readonly value: T;
    }
  | {
      readonly status: "outcome";
      readonly outcome: PublicOutcome;
    }
  | {
      readonly status: "error";
      readonly error: PublicErrorEnvelope;
    };

export interface DeterministicFakePlan<T> {
  readonly defaultResult: PortResult<T>;
  readonly abortedResult: PortResult<T>;
  readonly timedOutResult: PortResult<T>;
}

export const selectDeterministicFakeResult = <T>(
  context: PortInvocationContext,
  plan: DeterministicFakePlan<T>,
): PortResult<T> => {
  if (context.signal.aborted) {
    return plan.abortedResult;
  }

  if (!Number.isSafeInteger(context.timeoutMs) || context.timeoutMs <= 0) {
    return plan.timedOutResult;
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
  emit(event: SafeObservabilityEvent): Promise<void>;
}
