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
  type RestaurantSelectionScreenView,
  type ResultScreenView,
} from "./foundation.js";

const ANALYSIS_TOKEN_VERSION = 1;
const ANALYSIS_TOKEN_TTL_MS = 15 * 60 * 1000;
const ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OWNER_LEASE_MS = 90 * 1000;
const INVOCATION_TIMEOUT_MS = 85 * 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EVIDENCE_IDENTITY_VERSION = "evidence-identity/1.0.0";

export const LIVE_MENU_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export interface LiveAnalyzeInput {
  readonly bytes: Uint8Array;
  readonly mediaType: (typeof LIVE_MENU_MEDIA_TYPES)[number];
  readonly restaurantName: string | null;
  readonly signal: AbortSignal;
}

export interface LiveAnalyzeSuccess {
  readonly analysisToken: string;
  readonly restaurantScreen: RestaurantSelectionScreenView;
  readonly resultPreview: ResultScreenView;
}

export interface LiveConfirmInput {
  readonly analysisToken: string;
  readonly selectedCandidateId: string;
  readonly signal: AbortSignal;
}

export interface LiveConfirmSuccess {
  readonly analysisId: string;
  readonly menuVersionId: string;
  readonly publicationStatus: "published";
  readonly result: ResultScreenView;
}

interface TokenPayload {
  readonly version: 1;
  readonly expiresAt: string;
  readonly extraction: CompactMenuExtraction;
  readonly resolution: RestaurantResolution;
  readonly byteCount: number;
}

export interface LiveRestaurantConfirmationDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly now: () => Date;
  readonly generateId: () => string;
  readonly repository: MvpAnalysisRepository &
    Pick<PostgresMvpAnalysisRepository, "findActiveRestaurantMenuVersion">;
  readonly extractMenu: (
    source: MenuSourceInput,
    image: TransientUploadedMenuImage,
    context: PortInvocationContext,
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

const contextFor = (signal: AbortSignal): PortInvocationContext =>
  PortInvocationContextSchema.parse({
    contractVersion: MODULE_INTERFACE_VERSION,
    correlationId: randomUUID(),
    signal,
    timeoutMs: INVOCATION_TIMEOUT_MS,
  });

const safeRestaurantName = (value: string | null): string | null => {
  if (value === null) return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return normalized.length > 0 && normalized.length <= 200 ? normalized : null;
};

const sourceFingerprint = (bytes: Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const previewDraft = (byteCount: number) =>
  addLocalPhoto(createLocalInputDraft(), "uploaded-menu-photo", byteCount);

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
): ResultScreenView => buildResultScreen(previewDraft(byteCount), analysis);

export class LiveRestaurantConfirmationService {
  readonly #tokenKey: Buffer;

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
  }

  async analyze(
    input: LiveAnalyzeInput,
  ): Promise<PortResult<LiveAnalyzeSuccess>> {
    const context = contextFor(input.signal);
    if (
      input.bytes.byteLength === 0 ||
      input.bytes.byteLength > MAX_IMAGE_BYTES ||
      !LIVE_MENU_MEDIA_TYPES.includes(input.mediaType)
    ) {
      return {
        status: "error",
        error: publicError(
          input.bytes.byteLength > MAX_IMAGE_BYTES
            ? "PAYLOAD_TOO_LARGE"
            : "INVALID_INPUT",
          context,
        ),
      };
    }
    const restaurantName = safeRestaurantName(input.restaurantName);
    if (input.restaurantName !== null && restaurantName === null) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    const collectedAt = this.dependencies.now().toISOString();
    const contentHandle = `upload:${this.dependencies.generateId()}`;
    const source = MenuSourceInputSchema.parse({
      contractVersion: CONTRACT_VERSIONS.menuSource,
      source: {
        sourceRef: this.dependencies.generateId(),
        sourceType: "uploaded_menu",
        sourceFingerprint: sourceFingerprint(input.bytes),
        collectedAt,
      },
      restaurantContext: null,
      menuScope: "default",
      content: {
        kind: "image_collection",
        contentHandle,
        sensitivity: "sensitive_transient",
        byteCount: input.bytes.byteLength,
        pageCount: null,
      },
      requestedAt: collectedAt,
    });
    const extractionResult = await this.dependencies.extractMenu(
      source,
      { bytes: input.bytes, mediaType: input.mediaType },
      context,
    );
    if (extractionResult.status !== "success") return extractionResult;

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
    if (canonicalResult.status !== "success") return canonicalResult;

    const token = this.sealToken({
      version: ANALYSIS_TOKEN_VERSION,
      expiresAt: new Date(
        this.dependencies.now().getTime() + ANALYSIS_TOKEN_TTL_MS,
      ).toISOString(),
      extraction,
      resolution,
      byteCount: input.bytes.byteLength,
    });
    const draft = previewDraft(input.bytes.byteLength);
    return {
      status: "success",
      value: {
        analysisToken: token,
        restaurantScreen: buildRestaurantSelectionScreen(draft, resolution),
        resultPreview: buildResultScreen(draft, canonicalResult.value),
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
    if (
      !token.resolution.candidates.some(
        (candidate) => candidate.candidateId === input.selectedCandidateId,
      )
    ) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }

    const confirmationPort = new FoundationRestaurantResolutionPort(
      async (candidate) =>
        (await this.dependencies.repository.findRestaurantByExternalReference(
          candidate.googlePlaceId,
        )) ?? this.dependencies.generateId(),
    );
    const recordedAt = this.dependencies.now().toISOString();
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

    let extraction = withConfirmedContext(
      token.extraction,
      resolutionResult.value,
    );
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
      return this.successFromCanonical(reusable, token.byteCount);
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
      return this.successFromCanonical(owner.analysis, token.byteCount);
    }
    if (owner.status === "waiting") {
      const waited = await this.dependencies.repository.waitForReusableCanonicalAnalysis(
        identity,
        { maxPolls: 6, pollIntervalMs: 250 },
        () => this.dependencies.now().toISOString(),
      );
      return waited.status === "reusable"
        ? this.successFromCanonical(waited.analysis, token.byteCount)
        : {
            status: "error",
            error: publicError("ANALYSIS_TEMPORARILY_UNAVAILABLE", context),
          };
    }
    if (owner.status === "terminal") {
      return {
        status: "error",
        error: publicError(owner.safeErrorCode, context),
      };
    }

    const restaurantId = resolutionResult.value.restaurantId;
    if (restaurantId === null) {
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }
    const active = await this.dependencies.repository.findActiveRestaurantMenuVersion(
      restaurantId,
      extraction.menuScope,
    );
    const itemCount = extraction.sections.reduce(
      (count, section) => count + section.items.length,
      0,
    );
    const menuVersionId = this.dependencies.generateId();
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
        restaurantResolution: resolutionResult.value,
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
    return this.successFromCanonical(pipelineResult.value, token.byteCount);
  }

  private successFromCanonical(
    analysis: CanonicalMenuAnalysis,
    byteCount: number,
  ): PortResult<LiveConfirmSuccess> {
    if (analysis.publicationState !== "eligible" || analysis.menuVersion === null) {
      const context = contextFor(new AbortController().signal);
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }
    return {
      status: "success",
      value: {
        analysisId: analysis.analysisId,
        menuVersionId: analysis.menuVersion.menuVersionId,
        publicationStatus: "published",
        result: resultForCanonical(analysis, byteCount),
      },
    };
  }

  private sealToken(payload: TokenPayload): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#tokenKey, iv);
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
      typeof parsed.byteCount !== "number"
    ) {
      throw new TypeError("invalid analysis token");
    }
    return {
      version: ANALYSIS_TOKEN_VERSION,
      expiresAt: parsed.expiresAt,
      extraction: CompactMenuExtractionSchema.parse(parsed.extraction),
      resolution: RestaurantResolutionSchema.parse(parsed.resolution),
      byteCount: parsed.byteCount,
    };
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
  liveService = new LiveRestaurantConfirmationService({
    environment,
    now: () => new Date(),
    generateId: () => randomUUID(),
    repository,
    extractMenu: async (source, image, context) => {
      const adapter = createOpenAIMenuImageExtractionAdapterFromEnvironment(
        environment,
        (handle) =>
          handle === source.content.contentHandle ? image : null,
      );
      return adapter === null
        ? {
            status: "error",
            error: publicError("ANALYSIS_TEMPORARILY_UNAVAILABLE", context),
          }
        : adapter.extractWithRestaurantClues(source, context);
    },
    findCandidates: (clues, context) => finder.findCandidates(clues, context),
  });
  return liveService;
};
