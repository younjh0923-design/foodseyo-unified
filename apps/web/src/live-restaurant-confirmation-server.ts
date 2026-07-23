import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import {
  CONTRACT_VERSIONS,
  CompactMenuExtractionSchema,
  MenuSourceInputSchema,
  MODULE_INTERFACE_VERSION,
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  RestaurantResolutionSchema,
  SERVER_ENV_NAMES,
  parseFeatureFlag,
  type CanonicalMenuAnalysis,
  type CompactMenuExtraction,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type RestaurantCandidate,
  type RestaurantResolution,
} from "@foodseyo/contracts";
import {
  getRuntimeMvpAnalysisRepository,
  type MvpAnalysisRepository,
  type PostgresMvpAnalysisRepository,
  type SemanticVersionVector,
} from "@foodseyo/database";
import {
  CanonicalMenuValidationService,
  CanonicalPipelineApplicationService,
  OPENAI_MENU_EXTRACTION_VERSION,
  buildCanonicalMenuAnalysis,
  createOpenAIMenuImageExtractionAdapterFromEnvironment,
  type OpenAIMenuExtractionFailureStage,
  type OpenAIMenuExtractionResult,
  type TransientUploadedMenuImage,
} from "@foodseyo/menu-analysis";
import {
  FoundationRestaurantResolutionPort,
} from "@foodseyo/restaurant-resolution";
import {
  GooglePlacesCandidateFinder,
  createGooglePlacesTextSearchAdapterFromEnvironment,
} from "@foodseyo/restaurant-resolution/server";

import {
  addLocalPhoto,
  buildRestaurantSelectionScreen,
  buildResultScreen,
  createLocalInputDraft,
  preserveLinkInput,
  type RestaurantSelectionScreenView,
  type ResultScreenView,
  type UiLanguage,
  type SourceBoundMenuGuidance,
} from "./foundation.js";
import { RestaurantLinkCandidateResolver } from "./restaurant-link-server.js";
import { OfficialMenuAnalysisService } from "./official-menu-analysis-server.js";
import {
  OpenAIMenuGuidanceService,
  type OrderingAssistantAnswer,
} from "./openai-menu-guidance-server.js";

const ANALYSIS_TOKEN_VERSION = 3;
const ANALYSIS_TOKEN_TTL_MS = 15 * 60 * 1000;
const ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OWNER_LEASE_MS = 90 * 1000;
const INVOCATION_TIMEOUT_MS = 85 * 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 5;
const EVIDENCE_IDENTITY_VERSION = "evidence-identity/1.0.0";

export const LIVE_MENU_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

interface LiveAnalyzeBaseInput {
  readonly restaurantName: string | null;
  readonly language: UiLanguage;
  readonly signal: AbortSignal;
  readonly correlationId?: ReturnType<typeof randomUUID>;
  readonly observeSafeFailure?: (failure: SafeMenuAnalysisFailure) => void;
}

export type SafeMenuAnalysisFailureStage =
  | "request_parsing"
  | "image_decoding_size_validation"
  | OpenAIMenuExtractionFailureStage
  | "google_places_resolution"
  | "token_encryption";

export interface SafeMenuAnalysisFailure {
  readonly correlationId: string;
  readonly failedStage: SafeMenuAnalysisFailureStage;
  readonly safeErrorCode: PublicErrorCode;
  readonly imageCount: number;
  readonly imageByteSizes: readonly number[];
}

export type LiveAnalyzeInput = LiveAnalyzeBaseInput &
  (
    | {
        readonly images: readonly TransientUploadedMenuImage[];
        readonly bytes?: never;
        readonly mediaType?: never;
      }
    | {
        /** Backward-compatible single-image shape for existing callers. */
        readonly bytes: Uint8Array;
        readonly mediaType: (typeof LIVE_MENU_MEDIA_TYPES)[number];
        readonly images?: never;
      }
  );

export interface LiveAnalyzeSuccess {
  readonly analysisToken: string;
  readonly restaurantScreen: RestaurantSelectionScreenView;
  readonly resultPreview: ResultScreenView;
}

export interface LiveAnalyzeLinkInput {
  readonly link: string;
  readonly language: UiLanguage;
  readonly signal: AbortSignal;
}

export interface LiveAnalyzeLinkSuccess {
  readonly analysisToken: string;
  readonly restaurantScreen: RestaurantSelectionScreenView;
}

export interface LiveConfirmInput {
  readonly analysisToken: string;
  readonly selectedCandidateId: string | null;
  readonly signal: AbortSignal;
}

export interface LiveConfirmSuccess {
  readonly analysisId: string;
  readonly menuVersionId: string | null;
  readonly publicationStatus: "published" | "analysis_only_saved";
  readonly result: ResultScreenView;
  readonly assistantToken: string;
}

export interface LiveAssistantInput {
  readonly assistantToken: string;
  readonly question: string;
  readonly signal: AbortSignal;
}

export type LiveAssistantSuccess = OrderingAssistantAnswer;

interface TokenPayload {
  readonly version: 3;
  readonly expiresAt: string;
  readonly inputKind: "images" | "link";
  readonly extraction: CompactMenuExtraction | null;
  readonly link: string | null;
  readonly resolution: RestaurantResolution;
  readonly byteCount: number;
  readonly language: UiLanguage;
}

interface AssistantTokenPayload {
  readonly version: 1;
  readonly expiresAt: string;
  readonly language: UiLanguage;
  readonly result: ResultScreenView;
}

export interface LiveRestaurantConfirmationDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly now: () => Date;
  readonly generateId: () => string;
  readonly repository: MvpAnalysisRepository &
    Pick<PostgresMvpAnalysisRepository, "findActiveRestaurantMenuVersion">;
  readonly extractMenu: (
    source: MenuSourceInput,
    images: readonly TransientUploadedMenuImage[],
    context: PortInvocationContext,
    observeSafeFailure?: (
      failedStage: OpenAIMenuExtractionFailureStage,
      safeErrorCode: PublicErrorCode,
    ) => void,
  ) => Promise<PortResult<OpenAIMenuExtractionResult>>;
  readonly findCandidates: (
    clues: {
      readonly name: string | null;
      readonly address: string | null;
      readonly visualText: string | null;
      readonly linkFingerprint: null;
      readonly location: null;
    },
    context: PortInvocationContext,
  ) => Promise<PortResult<readonly RestaurantCandidate[]>>;
  readonly findCandidatesFromLink?: (
    link: string,
    context: PortInvocationContext,
  ) => Promise<PortResult<readonly RestaurantCandidate[]>>;
  readonly extractMenuFromLink?: (
    link: string,
    resolution: RestaurantResolution,
    context: PortInvocationContext,
  ) => Promise<
    PortResult<{
      readonly extraction: CompactMenuExtraction;
      readonly byteCount: number;
    }>
  >;
  readonly buildMenuGuidance?: (
    analysis: CanonicalMenuAnalysis,
    language: UiLanguage,
    context: PortInvocationContext,
  ) => Promise<readonly SourceBoundMenuGuidance[]>;
  readonly answerOrderingQuestion?: (
    result: ResultScreenView,
    question: string,
    language: UiLanguage,
    context: PortInvocationContext,
  ) => Promise<PortResult<OrderingAssistantAnswer>>;
}

const publicError = (
  code: PublicErrorCode,
  context: PortInvocationContext,
) => {
  const definition = PUBLIC_ERROR_REGISTRY[code];
  return PublicErrorEnvelopeSchema.parse({
    error: {
      code,
      message: definition.message,
      correlationId: context.correlationId,
      retryable: definition.retryable,
    },
    httpStatus: definition.httpStatus,
  });
};

const contextFor = (
  signal: AbortSignal,
  correlationId = randomUUID(),
): PortInvocationContext =>
  PortInvocationContextSchema.parse({
    contractVersion: MODULE_INTERFACE_VERSION,
    correlationId,
    signal,
    timeoutMs: INVOCATION_TIMEOUT_MS,
  });

const safeRestaurantName = (value: string | null): string | null => {
  if (value === null) return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return normalized.length > 0 && normalized.length <= 200 ? normalized : null;
};

const sourceFingerprint = (
  images: readonly TransientUploadedMenuImage[],
): string => {
  const hash = createHash("sha256");
  for (const image of images) {
    hash.update(image.mediaType, "utf8");
    const byteCount = Buffer.allocUnsafe(8);
    byteCount.writeBigUInt64BE(BigInt(image.bytes.byteLength));
    hash.update(byteCount);
    hash.update(image.bytes);
  }
  return `sha256:${hash.digest("hex")}`;
};

const previewDraft = (byteCount: number, imageCount = 1) => {
  let draft = createLocalInputDraft();
  for (let index = 0; index < imageCount; index += 1) {
    draft = addLocalPhoto(
      draft,
      `uploaded-menu-photo-${index + 1}`,
      index === 0 ? byteCount : null,
    );
  }
  return draft;
};

const linkDraft = (link: string) =>
  preserveLinkInput(createLocalInputDraft(), link);

const normalizedRestaurantLink = (value: string): string | null => {
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length === 0 || normalized.length > 2_048) return null;
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizedImages = (
  input: LiveAnalyzeInput,
): readonly TransientUploadedMenuImage[] =>
  "images" in input && input.images !== undefined
    ? input.images
    : [{ bytes: input.bytes, mediaType: input.mediaType }];

const rejectedResolution = (): RestaurantResolution =>
  RestaurantResolutionSchema.parse({
    contractVersion: CONTRACT_VERSIONS.restaurantResolution,
    state: "rejected",
    candidates: [],
    selectedCandidateId: null,
    restaurantId: null,
    confirmationEvidence: null,
    requiresUserConfirmation: false,
    canContinueMenuOnly: true,
    resolvedAt: null,
  });

const rebindExtractionSource = (
  extraction: CompactMenuExtraction,
  sourceRef: string,
): CompactMenuExtraction =>
  CompactMenuExtractionSchema.parse({
    ...extraction,
    source: { ...extraction.source, sourceRef },
    sections: extraction.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        sourceEvidence: item.sourceEvidence.map((evidence) => ({
          ...evidence,
          sourceRef,
        })),
      })),
    })),
  });

const withConfirmedContext = (
  extraction: CompactMenuExtraction,
  resolution: RestaurantResolution,
): CompactMenuExtraction => {
  const selected = resolution.candidates.find(
    (candidate) => candidate.candidateId === resolution.selectedCandidateId,
  );
  if (
    selected === undefined ||
    resolution.restaurantId === null ||
    (resolution.state !== "user_confirmed" &&
      resolution.state !== "externally_verified")
  ) {
    throw new TypeError("confirmed extraction requires one selected restaurant");
  }
  return CompactMenuExtractionSchema.parse({
    ...extraction,
    restaurantContext: {
      restaurantId: resolution.restaurantId,
      candidateId: selected.candidateId,
      googlePlaceId: selected.googlePlaceId,
      resolutionState: resolution.state,
    },
  });
};

const versionVector = (modelVersion: string): SemanticVersionVector => ({
  analysisSnapshotVersion: CONTRACT_VERSIONS.analysisSnapshot,
  boundaryDtoVersion: CONTRACT_VERSIONS.boundaryDtos,
  compactExtractionVersion: CONTRACT_VERSIONS.compactExtraction,
  consistencyVersion: CONTRACT_VERSIONS.consistency,
  dishKnowledgeVersion: CONTRACT_VERSIONS.dishKnowledge,
  exactCacheKeyVersion: CONTRACT_VERSIONS.exactCacheKey,
  explanationRendererVersion: CONTRACT_VERSIONS.explanationRenderer,
  menuSourceVersion: CONTRACT_VERSIONS.menuSource,
  mergePolicyVersion: CONTRACT_VERSIONS.mergePolicy,
  modelVersion,
  moduleInterfaceVersion: CONTRACT_VERSIONS.moduleInterfaces,
  promptVersion: OPENAI_MENU_EXTRACTION_VERSION.prompt,
  providerSchemaVersion: OPENAI_MENU_EXTRACTION_VERSION.providerSchema,
  restaurantResolutionVersion: CONTRACT_VERSIONS.restaurantResolution,
});

const resultForCanonical = (
  analysis: CanonicalMenuAnalysis,
  byteCount: number,
  language: UiLanguage,
  guidance: readonly SourceBoundMenuGuidance[],
): ResultScreenView =>
  buildResultScreen(previewDraft(byteCount), analysis, language, guidance);

export class LiveRestaurantConfirmationService {
  readonly #tokenKey: Buffer;
  readonly #assistantTokenKey: Buffer;

  constructor(
    private readonly dependencies: LiveRestaurantConfirmationDependencies,
  ) {
    const secret = dependencies.environment[SERVER_ENV_NAMES.openAiApiKey];
    if (typeof secret !== "string" || secret.trim().length === 0) {
      throw new Error("Foodseyo analysis configuration is unavailable.");
    }
    this.#tokenKey = createHash("sha256")
      .update("foodseyo-analysis-token-v1\u0000")
      .update(secret)
      .digest();
    this.#assistantTokenKey = createHash("sha256")
      .update("foodseyo-assistant-token-v1\u0000")
      .update(secret)
      .digest();
  }

  async analyze(
    input: LiveAnalyzeInput,
  ): Promise<PortResult<LiveAnalyzeSuccess>> {
    const context = contextFor(input.signal, input.correlationId);
    const images = normalizedImages(input);
    const byteCount = images.reduce(
      (total, image) => total + image.bytes.byteLength,
      0,
    );
    let failureObserved = false;
    const observeFailure = (
      failedStage: SafeMenuAnalysisFailureStage,
      safeErrorCode: PublicErrorCode,
    ): void => {
      if (failureObserved) return;
      failureObserved = true;
      input.observeSafeFailure?.({
        correlationId: context.correlationId,
        failedStage,
        safeErrorCode,
        imageCount: images.length,
        imageByteSizes: images.map((image) => image.bytes.byteLength),
      });
    };
    if (
      images.length === 0 ||
      images.length > MAX_IMAGE_COUNT ||
      images.some(
        (image) =>
          image.bytes.byteLength === 0 ||
          image.bytes.byteLength > MAX_IMAGE_BYTES ||
          !LIVE_MENU_MEDIA_TYPES.includes(image.mediaType),
      )
    ) {
      const safeErrorCode = images.some(
        (image) => image.bytes.byteLength > MAX_IMAGE_BYTES,
      )
        ? "PAYLOAD_TOO_LARGE"
        : "INVALID_INPUT";
      observeFailure("image_decoding_size_validation", safeErrorCode);
      return {
        status: "error",
        error: publicError(safeErrorCode, context),
      };
    }
    const restaurantName = safeRestaurantName(input.restaurantName);
    if (input.restaurantName !== null && restaurantName === null) {
      observeFailure("request_parsing", "INVALID_INPUT");
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    const collectedAt = this.dependencies.now().toISOString();
    const contentHandle = `upload:${this.dependencies.generateId()}`;
    const source = MenuSourceInputSchema.parse({
      contractVersion: CONTRACT_VERSIONS.menuSource,
      source: {
        sourceRef: this.dependencies.generateId(),
        sourceType: "uploaded_menu",
        sourceFingerprint: sourceFingerprint(images),
        collectedAt,
      },
      restaurantContext: null,
      menuScope: "default",
      content: {
        kind: "image_collection",
        contentHandle,
        sensitivity: "sensitive_transient",
        byteCount,
        pageCount: null,
      },
      requestedAt: collectedAt,
    });
    const extractionResult = await this.dependencies.extractMenu(
      source,
      images,
      context,
      observeFailure,
    );
    if (extractionResult.status !== "success") {
      if (extractionResult.status === "error") {
        const code = extractionResult.error.error.code;
        observeFailure(
          code === "INVALID_INPUT"
            ? "image_decoding_size_validation"
            : code === "INVALID_UPSTREAM_RESULT"
              ? "provider_schema_validation"
              : "openai_request",
          code,
        );
      }
      return extractionResult;
    }

    const clues = extractionResult.value.restaurantClues;
    const candidateResult = await this.dependencies.findCandidates(
      {
        name: restaurantName ?? clues.name,
        address: clues.address,
        visualText: clues.visualText,
        linkFingerprint: null,
        location: null,
      },
      context,
    );
    let resolution: RestaurantResolution;
    if (candidateResult.status === "success") {
      const resolutionResult = await new FoundationRestaurantResolutionPort().resolve(
        {
          candidates: candidateResult.value,
          priorResolution: null,
          selectedCandidateId: null,
          confirmationEvidence: null,
        },
        context,
      );
      if (resolutionResult.status !== "success") {
        if (resolutionResult.status === "outcome") {
          resolution = rejectedResolution();
        } else {
          return resolutionResult;
        }
      } else {
        resolution = resolutionResult.value;
      }
    } else if (candidateResult.status === "outcome") {
      resolution = rejectedResolution();
    } else {
      observeFailure(
        "google_places_resolution",
        candidateResult.error.error.code,
      );
      return candidateResult;
    }

    const extraction = extractionResult.value.extraction;
    const menuItemCount = extraction.sections.reduce(
      (count, section) => count + section.items.length,
      0,
    );
    const validation = new CanonicalMenuValidationService((request) =>
      buildCanonicalMenuAnalysis(request, {
        analysisId: this.dependencies.generateId(),
        validatedAt: this.dependencies.now().toISOString(),
        menuVersionId: null,
        menuItemIds: Array.from({ length: menuItemCount }, () =>
          this.dependencies.generateId(),
        ),
      }),
    );
    const canonicalResult = await validation.validate(
      { extraction, restaurantResolution: resolution },
      context,
    );
    if (canonicalResult.status !== "success") {
      if (canonicalResult.status === "error") {
        observeFailure(
          "canonical_conversion",
          canonicalResult.error.error.code,
        );
      }
      return canonicalResult;
    }

    let token: string;
    try {
      token = this.sealToken({
        version: ANALYSIS_TOKEN_VERSION,
        expiresAt: new Date(
          this.dependencies.now().getTime() + ANALYSIS_TOKEN_TTL_MS,
        ).toISOString(),
        inputKind: "images",
        extraction,
        link: null,
        resolution,
        byteCount,
        language: input.language,
      });
    } catch {
      observeFailure("token_encryption", "INTERNAL_ERROR");
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }
    const draft = previewDraft(byteCount, images.length);
    return {
      status: "success",
      value: {
        analysisToken: token,
        restaurantScreen: buildRestaurantSelectionScreen(
          draft,
          resolution,
          input.language,
        ),
        resultPreview: buildResultScreen(
          draft,
          canonicalResult.value,
          input.language,
        ),
      },
    };
  }

  async analyzeLink(
    input: LiveAnalyzeLinkInput,
  ): Promise<PortResult<LiveAnalyzeLinkSuccess>> {
    const context = contextFor(input.signal);
    const link = normalizedRestaurantLink(input.link);
    if (link === null || this.dependencies.findCandidatesFromLink === undefined) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    const candidateResult = await this.dependencies.findCandidatesFromLink(
      link,
      context,
    );
    let resolution: RestaurantResolution;
    if (candidateResult.status === "success") {
      const resolutionResult = await new FoundationRestaurantResolutionPort().resolve(
        {
          candidates: candidateResult.value,
          priorResolution: null,
          selectedCandidateId: null,
          confirmationEvidence: null,
        },
        context,
      );
      if (resolutionResult.status !== "success") {
        if (resolutionResult.status === "outcome") {
          resolution = rejectedResolution();
        } else {
          return resolutionResult;
        }
      } else {
        resolution = resolutionResult.value;
      }
    } else if (candidateResult.status === "outcome") {
      resolution = rejectedResolution();
    } else {
      return candidateResult;
    }
    const token = this.sealToken({
      version: ANALYSIS_TOKEN_VERSION,
      expiresAt: new Date(
        this.dependencies.now().getTime() + ANALYSIS_TOKEN_TTL_MS,
      ).toISOString(),
      inputKind: "link",
      extraction: null,
      link,
      resolution,
      byteCount: 0,
      language: input.language,
    });
    return {
      status: "success",
      value: {
        analysisToken: token,
        restaurantScreen: buildRestaurantSelectionScreen(
          linkDraft(link),
          resolution,
          input.language,
        ),
      },
    };
  }

  async confirm(
    input: LiveConfirmInput,
  ): Promise<PortResult<LiveConfirmSuccess>> {
    const context = contextFor(input.signal);
    let token: TokenPayload;
    try {
      token = this.openToken(input.analysisToken);
    } catch {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    if (Date.parse(token.expiresAt) <= this.dependencies.now().getTime()) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    const continuesMenuOnly = input.selectedCandidateId === null;
    if (continuesMenuOnly) {
      if (
        token.inputKind !== "images" ||
        token.extraction === null ||
        token.resolution.candidates.length !== 0 ||
        !token.resolution.canContinueMenuOnly
      ) {
        return { status: "error", error: publicError("INVALID_INPUT", context) };
      }
    } else if (
      !token.resolution.candidates.some(
        (candidate) => candidate.candidateId === input.selectedCandidateId,
      )
    ) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }

    const recordedAt = this.dependencies.now().toISOString();
    let resolution: RestaurantResolution;
    if (continuesMenuOnly) {
      resolution = token.resolution;
    } else {
      const confirmationPort = new FoundationRestaurantResolutionPort(
        async (candidate) =>
          (await this.dependencies.repository.findRestaurantByExternalReference(
            candidate.googlePlaceId,
          )) ?? this.dependencies.generateId(),
      );
      const resolutionResult = await confirmationPort.resolve(
        {
          candidates: token.resolution.candidates,
          priorResolution: token.resolution,
          selectedCandidateId: input.selectedCandidateId,
          confirmationEvidence: {
            kind: "user_action",
            actionRef: `action:${this.dependencies.generateId()}`,
            recordedAt,
          },
        },
        context,
      );
      if (resolutionResult.status !== "success") return resolutionResult;
      resolution = resolutionResult.value;
    }

    let extraction: CompactMenuExtraction;
    let byteCount = token.byteCount;
    if (token.inputKind === "link") {
      if (
        token.link === null ||
        this.dependencies.extractMenuFromLink === undefined
      ) {
        return {
          status: "error",
          error: publicError("ANALYSIS_TEMPORARILY_UNAVAILABLE", context),
        };
      }
      const extracted = await this.dependencies.extractMenuFromLink(
        token.link,
        resolution,
        context,
      );
      if (extracted.status !== "success") return extracted;
      extraction = withConfirmedContext(
        extracted.value.extraction,
        resolution,
      );
      byteCount = extracted.value.byteCount;
    } else {
      if (token.extraction === null) {
        return { status: "error", error: publicError("INVALID_INPUT", context) };
      }
      extraction = continuesMenuOnly
        ? token.extraction
        : withConfirmedContext(token.extraction, resolution);
    }
    const modelVersion =
      this.dependencies.environment[SERVER_ENV_NAMES.menuExtractionModel]?.trim();
    if (!modelVersion) {
      return {
        status: "error",
        error: publicError("ANALYSIS_TEMPORARILY_UNAVAILABLE", context),
      };
    }
    let identity;
    try {
      identity = await this.dependencies.repository.resolveExactIdentity({
        analysisContractId: this.dependencies.generateId(),
        evidenceSetId: this.dependencies.generateId(),
        sourceRef: extraction.source.sourceRef,
        sourceType: extraction.source.sourceType,
        sourceFingerprint: extraction.source.sourceFingerprint,
        evidenceIdentityVersion: EVIDENCE_IDENTITY_VERSION,
        collectedAt: extraction.source.collectedAt,
        createdAt: recordedAt,
        versions: versionVector(modelVersion),
      });
      extraction = rebindExtractionSource(extraction, identity.sourceRef);
    } catch {
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }

    const reusable = await this.dependencies.repository.findReusableCanonicalAnalysis(
      identity,
      recordedAt,
    );
    if (reusable !== null) {
      if (
        reusable.restaurantResolution.selectedCandidateId !==
        input.selectedCandidateId
      ) {
        return { status: "error", error: publicError("INVALID_INPUT", context) };
      }
      return this.successFromCanonical(
        reusable,
        byteCount,
        token.language,
        context,
      );
    }

    const runId = this.dependencies.generateId();
    const owner = await this.dependencies.repository.acquireAnalysisOwner({
      identity,
      runId,
      startedAt: recordedAt,
      leaseExpiresAt: new Date(
        Date.parse(recordedAt) + OWNER_LEASE_MS,
      ).toISOString(),
    });
    if (owner.status === "reusable") {
      if (
        owner.analysis.restaurantResolution.selectedCandidateId !==
        input.selectedCandidateId
      ) {
        return { status: "error", error: publicError("INVALID_INPUT", context) };
      }
      return this.successFromCanonical(
        owner.analysis,
        byteCount,
        token.language,
        context,
      );
    }
    if (owner.status === "waiting") {
      const waited = await this.dependencies.repository.waitForReusableCanonicalAnalysis(
        identity,
        { maxPolls: 6, pollIntervalMs: 250 },
        () => this.dependencies.now().toISOString(),
      );
      if (waited.status !== "reusable") {
        return {
          status: "error",
          error: publicError("ANALYSIS_TEMPORARILY_UNAVAILABLE", context),
        };
      }
      if (
        waited.analysis.restaurantResolution.selectedCandidateId !==
        input.selectedCandidateId
      ) {
        return { status: "error", error: publicError("INVALID_INPUT", context) };
      }
      return this.successFromCanonical(
        waited.analysis,
        byteCount,
        token.language,
        context,
      );
    }
    if (owner.status === "terminal") {
      return {
        status: "error",
        error: publicError(owner.safeErrorCode, context),
      };
    }

    const restaurantId = resolution.restaurantId;
    if (!continuesMenuOnly && restaurantId === null) {
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }
    const active =
      restaurantId === null
        ? null
        : await this.dependencies.repository.findActiveRestaurantMenuVersion(
            restaurantId,
            extraction.menuScope,
          );
    const itemCount = extraction.sections.reduce(
      (count, section) => count + section.items.length,
      0,
    );
    const menuVersionId =
      restaurantId === null ? null : this.dependencies.generateId();
    const validator = new CanonicalMenuValidationService((request) =>
      buildCanonicalMenuAnalysis(request, {
        analysisId: this.dependencies.generateId(),
        validatedAt: this.dependencies.now().toISOString(),
        menuVersionId,
        menuItemIds: Array.from({ length: itemCount }, () =>
          this.dependencies.generateId(),
        ),
        versionOrdinal: (active?.versionOrdinal ?? 0) + 1,
        supersedesMenuVersionId: active?.menuVersionId ?? null,
      }),
    );
    const generatedIds = Array.from({ length: 3 }, () =>
      this.dependencies.generateId(),
    );
    let generatedIndex = 0;
    const pipeline = new CanonicalPipelineApplicationService(
      validator,
      this.dependencies.repository,
      {
        identity,
        runId,
        persistedAt: recordedAt,
        expiresAt: new Date(
          Date.parse(recordedAt) + ANALYSIS_CACHE_TTL_MS,
        ).toISOString(),
        generateId: () => {
          const value = generatedIds[generatedIndex];
          if (value === undefined) throw new Error("pipeline ID budget exhausted");
          generatedIndex += 1;
          return value;
        },
      },
    );
    const pipelineResult = await pipeline.run(
      {
        extraction,
        restaurantResolution: resolution,
      },
      context,
    );
    if (pipelineResult.status !== "success") {
      try {
        await this.dependencies.repository.markAnalysisFailure({
          identity,
          runId,
          kind: "retryable",
          safeErrorCode:
            pipelineResult.status === "error" &&
            [
              "ANALYSIS_TEMPORARILY_UNAVAILABLE",
              "INTERNAL_ERROR",
              "INVALID_UPSTREAM_RESULT",
              "UPSTREAM_TIMEOUT",
            ].includes(pipelineResult.error.error.code)
              ? (pipelineResult.error.error.code as
                  | "ANALYSIS_TEMPORARILY_UNAVAILABLE"
                  | "INTERNAL_ERROR"
                  | "INVALID_UPSTREAM_RESULT"
                  | "UPSTREAM_TIMEOUT")
              : "INTERNAL_ERROR",
          finishedAt: this.dependencies.now().toISOString(),
        });
      } catch {
        // Failure bookkeeping must never replace the safe pipeline error.
      }
      return pipelineResult;
    }
    return this.successFromCanonical(
      pipelineResult.value,
      byteCount,
      token.language,
      context,
    );
  }

  async assist(
    input: LiveAssistantInput,
  ): Promise<PortResult<LiveAssistantSuccess>> {
    const context = contextFor(input.signal);
    const question = input.question
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim();
    if (
      question.length === 0 ||
      question.length > 500 ||
      this.dependencies.answerOrderingQuestion === undefined
    ) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    let token: AssistantTokenPayload;
    try {
      token = this.openAssistantToken(input.assistantToken);
    } catch {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    if (Date.parse(token.expiresAt) <= this.dependencies.now().getTime()) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    return this.dependencies.answerOrderingQuestion(
      token.result,
      question,
      token.language,
      context,
    );
  }

  private async successFromCanonical(
    analysis: CanonicalMenuAnalysis,
    byteCount: number,
    language: UiLanguage,
    context: PortInvocationContext,
  ): Promise<PortResult<LiveConfirmSuccess>> {
    if (
      (analysis.publicationState === "eligible" && analysis.menuVersion === null) ||
      (analysis.publicationState === "analysis_only" && analysis.menuVersion !== null)
    ) {
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }
    const guidance =
      this.dependencies.buildMenuGuidance === undefined
        ? []
        : await this.dependencies.buildMenuGuidance(
            analysis,
            language,
            context,
          );
    const result = resultForCanonical(
      analysis,
      byteCount,
      language,
      guidance,
    );
    return {
      status: "success",
      value: {
        analysisId: analysis.analysisId,
        menuVersionId: analysis.menuVersion?.menuVersionId ?? null,
        publicationStatus:
          analysis.publicationState === "eligible"
            ? "published"
            : "analysis_only_saved",
        result,
        assistantToken: this.sealAssistantToken({
          version: 1,
          expiresAt: new Date(
            this.dependencies.now().getTime() + ANALYSIS_TOKEN_TTL_MS,
          ).toISOString(),
          language,
          result,
        }),
      },
    };
  }

  private sealToken(payload: TokenPayload): string {
    return this.sealPayload(payload, this.#tokenKey);
  }

  private sealAssistantToken(payload: AssistantTokenPayload): string {
    return this.sealPayload(payload, this.#assistantTokenKey);
  }

  private sealPayload(payload: unknown, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  private openToken(value: string): TokenPayload {
    if (value.length === 0 || value.length > 200_000) {
      throw new TypeError("invalid analysis token");
    }
    const parts = value.split(".");
    if (parts.length !== 3) throw new TypeError("invalid analysis token");
    const [ivPart, tagPart, ciphertextPart] = parts;
    if (!ivPart || !tagPart || !ciphertextPart) {
      throw new TypeError("invalid analysis token");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#tokenKey,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<TokenPayload>;
    if (
      parsed.version !== ANALYSIS_TOKEN_VERSION ||
      typeof parsed.expiresAt !== "string" ||
      Number.isNaN(Date.parse(parsed.expiresAt)) ||
      typeof parsed.byteCount !== "number" ||
      !Number.isSafeInteger(parsed.byteCount) ||
      parsed.byteCount < 0 ||
      (parsed.inputKind !== "images" && parsed.inputKind !== "link") ||
      (parsed.link !== null && typeof parsed.link !== "string") ||
      (parsed.language !== "en" && parsed.language !== "ko") ||
      (parsed.inputKind === "images" &&
        (parsed.extraction === null || parsed.link !== null)) ||
      (parsed.inputKind === "link" &&
        (parsed.extraction !== null || typeof parsed.link !== "string"))
    ) {
      throw new TypeError("invalid analysis token");
    }
    return {
      version: ANALYSIS_TOKEN_VERSION,
      expiresAt: parsed.expiresAt,
      inputKind: parsed.inputKind,
      extraction:
        parsed.extraction === null
          ? null
          : CompactMenuExtractionSchema.parse(parsed.extraction),
      link: parsed.link,
      resolution: RestaurantResolutionSchema.parse(parsed.resolution),
      byteCount: parsed.byteCount,
      language: parsed.language,
    };
  }

  private openAssistantToken(value: string): AssistantTokenPayload {
    if (value.length === 0 || value.length > 500_000) {
      throw new TypeError("invalid assistant token");
    }
    const parts = value.split(".");
    if (parts.length !== 3) throw new TypeError("invalid assistant token");
    const [ivPart, tagPart, ciphertextPart] = parts;
    if (!ivPart || !tagPart || !ciphertextPart) {
      throw new TypeError("invalid assistant token");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#assistantTokenKey,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      typeof parsed.expiresAt !== "string" ||
      (parsed.language !== "en" && parsed.language !== "ko") ||
      !isRecord(parsed.result) ||
      parsed.result.kind !== "overview" ||
      !Array.isArray(parsed.result.menuItems)
    ) {
      throw new TypeError("invalid assistant token");
    }
    return parsed as unknown as AssistantTokenPayload;
  }
}

let liveService: LiveRestaurantConfirmationService | null = null;

export const createLiveRestaurantConfirmationService = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LiveRestaurantConfirmationService => {
  if (liveService !== null) return liveService;
  if (
    !parseFeatureFlag(environment[SERVER_ENV_NAMES.restaurantResolutionEnabled])
  ) {
    throw new Error("Foodseyo restaurant resolution is unavailable.");
  }
  const databaseUrl = environment[SERVER_ENV_NAMES.databaseUrl];
  if (typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    throw new Error("Foodseyo database runtime configuration is unavailable.");
  }
  const repository = getRuntimeMvpAnalysisRepository(databaseUrl);
  const places = createGooglePlacesTextSearchAdapterFromEnvironment(environment);
  if (places === null) {
    throw new Error("Foodseyo restaurant resolution is unavailable.");
  }
  const finder = new GooglePlacesCandidateFinder(places);
  const linkResolver = new RestaurantLinkCandidateResolver(
    environment,
    (clues, context) => finder.findCandidates(clues, context),
  );
  const officialMenuAnalysis = new OfficialMenuAnalysisService(environment);
  const menuGuidance = new OpenAIMenuGuidanceService(environment);
  liveService = new LiveRestaurantConfirmationService({
    environment,
    now: () => new Date(),
    generateId: () => randomUUID(),
    repository,
    extractMenu: async (source, images, context, observeSafeFailure) => {
      const adapter = createOpenAIMenuImageExtractionAdapterFromEnvironment(
        environment,
        (handle) =>
          handle === source.content.contentHandle ? images : null,
        {
          observeSafeFailure: (failure) =>
            observeSafeFailure?.(
              failure.failedStage,
              failure.safeErrorCode,
            ),
        },
      );
      return adapter === null
        ? {
            status: "error",
            error: publicError("ANALYSIS_TEMPORARILY_UNAVAILABLE", context),
          }
        : adapter.extractWithRestaurantClues(source, context);
    },
    findCandidates: (clues, context) => finder.findCandidates(clues, context),
    findCandidatesFromLink: (link, context) =>
      linkResolver.resolve(link, context),
    extractMenuFromLink: (link, resolution, context) =>
      officialMenuAnalysis.extract(link, resolution, context),
    buildMenuGuidance: (analysis, language, context) =>
      menuGuidance.build(analysis, language, context),
    answerOrderingQuestion: (result, question, language, context) =>
      menuGuidance.answer(result, question, language, context),
  });
  return liveService;
};
