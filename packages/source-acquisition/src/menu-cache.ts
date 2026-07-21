import {
  MENU_SCOPES,
  PUBLIC_ERROR_REGISTRY,
  MenuItemSchema,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  RestaurantMenuVersionSchema,
  RestaurantResolutionSchema,
  type CanonicalPublicationState,
  type MenuItem,
  type MenuScope,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type RestaurantLocaleEvidence,
  type RestaurantMenuVersion,
  type RestaurantResolution,
} from "@foodseyo/contracts";

export const MENU_CACHE_COVERAGES = ["full_menu", "partial_menu"] as const;

export type MenuCacheCoverage = (typeof MENU_CACHE_COVERAGES)[number];

/** Lightweight repository projection consumed by the cache decision only. */
export interface MenuCacheCandidate {
  readonly googlePlaceId: string;
  readonly menuVersion: RestaurantMenuVersion;
  readonly publicationState: CanonicalPublicationState;
  readonly coverage: MenuCacheCoverage;
  readonly localeEvidence: RestaurantLocaleEvidence | null;
}

export interface MenuCacheRepositoryLookup {
  readonly googlePlaceId: string;
  readonly restaurantId: string;
  readonly menuScope: MenuScope;
}

export interface MenuCacheRepository {
  findCandidates(
    lookup: MenuCacheRepositoryLookup,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly MenuCacheCandidate[]>>;
}

/** Minimal canonical read projection; it intentionally excludes resolution data. */
export interface MenuCacheBody {
  readonly menuVersionId: string;
  readonly menuScope: MenuScope;
  readonly coverage: MenuCacheCoverage;
  readonly menuItems: readonly MenuItem[];
}

export interface MenuCacheBodyRepository {
  findByMenuVersionId(
    menuVersionId: string,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuCacheBody | null>>;
}

export type MenuCacheLookupOutcome =
  | {
      readonly kind: "fresh_hit";
      readonly candidate: MenuCacheCandidate;
    }
  | {
      readonly kind: "stale";
      readonly candidate: MenuCacheCandidate;
    }
  | {
      readonly kind: "cache_miss";
      readonly candidate: null;
    };

export type MenuCacheBodyLookupOutcome =
  | {
      readonly kind: "fresh_hit";
      readonly candidate: MenuCacheCandidate;
      readonly body: MenuCacheBody;
    }
  | Extract<MenuCacheLookupOutcome, { readonly kind: "stale" | "cache_miss" }>;

const publicError = (
  code: PublicErrorCode,
  context: PortInvocationContext,
): PublicErrorEnvelope => {
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

const cloneCandidate = (candidate: MenuCacheCandidate): MenuCacheCandidate => ({
  googlePlaceId: candidate.googlePlaceId,
  menuVersion: {
    ...candidate.menuVersion,
    sourceRefs: [...candidate.menuVersion.sourceRefs],
  },
  publicationState: candidate.publicationState,
  coverage: candidate.coverage,
  localeEvidence:
    candidate.localeEvidence === null
      ? null
      : { ...candidate.localeEvidence },
});

const cloneMenuItem = (item: MenuItem): MenuItem => ({
  ...item,
  price: item.price === null ? null : { ...item.price },
  optionTexts: [...item.optionTexts],
  sourceEvidence: item.sourceEvidence.map((evidence) => ({
    ...evidence,
    sourceIndexes: [...evidence.sourceIndexes],
  })),
});

const cloneBody = (body: MenuCacheBody): MenuCacheBody => ({
  menuVersionId: body.menuVersionId,
  menuScope: body.menuScope,
  coverage: body.coverage,
  menuItems: body.menuItems.map(cloneMenuItem),
});

/** Deterministic read-only fake; it never exposes its stored object references. */
export class InMemoryMenuCacheRepository implements MenuCacheRepository {
  #callCount = 0;
  readonly #candidates: readonly MenuCacheCandidate[];

  constructor(candidates: readonly MenuCacheCandidate[]) {
    this.#candidates = candidates.map(cloneCandidate);
  }

  get callCount(): number {
    return this.#callCount;
  }

  findCandidates(
    lookup: MenuCacheRepositoryLookup,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly MenuCacheCandidate[]>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    if (
      lookup.googlePlaceId.trim().length === 0 ||
      lookup.restaurantId.trim().length === 0 ||
      !MENU_SCOPES.includes(lookup.menuScope)
    ) {
      return Promise.resolve({
        status: "error",
        error: publicError("INVALID_INPUT", context),
      });
    }

    return Promise.resolve({
      status: "success",
      value: this.#candidates
        .filter(
          (candidate) =>
            candidate.googlePlaceId === lookup.googlePlaceId &&
            candidate.menuVersion.restaurantId === lookup.restaurantId &&
            candidate.menuVersion.menuScope === lookup.menuScope,
        )
        .map(cloneCandidate),
    });
  }
}

/** Read-only body fake with defensive copies at storage and return boundaries. */
export class InMemoryMenuCacheBodyRepository
  implements MenuCacheBodyRepository
{
  #callCount = 0;
  readonly #bodies: readonly MenuCacheBody[];

  constructor(bodies: readonly MenuCacheBody[]) {
    this.#bodies = bodies.map(cloneBody);
  }

  get callCount(): number {
    return this.#callCount;
  }

  findByMenuVersionId(
    menuVersionId: string,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuCacheBody | null>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    if (menuVersionId.trim().length === 0) {
      return Promise.resolve({
        status: "error",
        error: publicError("INVALID_INPUT", context),
      });
    }
    const body = this.#bodies.find(
      (candidate) => candidate.menuVersionId === menuVersionId,
    );
    return Promise.resolve({
      status: "success",
      value: body === undefined ? null : cloneBody(body),
    });
  }
}

const validLocaleEvidence = (
  value: RestaurantLocaleEvidence | null,
): boolean =>
  value === null ||
  (/^[A-Z]{2}$/u.test(value.countryCode) &&
    /^[A-Z]{3}$/u.test(value.currencyCode) &&
    (value.countryBasis === "source_stated" ||
      value.countryBasis === "inferred_from_source") &&
    (value.currencyBasis === "source_stated" ||
      value.currencyBasis === "inferred_from_source"));

const localeConflicts = (
  resolutionLocale: RestaurantLocaleEvidence | null | undefined,
  cacheLocale: RestaurantLocaleEvidence | null,
): boolean =>
  resolutionLocale !== null &&
  resolutionLocale !== undefined &&
  cacheLocale !== null &&
  (resolutionLocale.countryCode !== cacheLocale.countryCode ||
    resolutionLocale.currencyCode !== cacheLocale.currencyCode);

const coverageSatisfies = (
  available: MenuCacheCoverage,
  requested: MenuCacheCoverage,
): boolean => requested === "partial_menu" || available === "full_menu";

const stableCandidateKey = (candidate: MenuCacheCandidate): string =>
  [
    candidate.googlePlaceId,
    candidate.menuVersion.restaurantId,
    candidate.menuVersion.menuScope,
    candidate.menuVersion.state,
    candidate.menuVersion.validUntil ?? "",
    candidate.menuVersion.supersedesMenuVersionId ?? "",
    candidate.menuVersion.sourceRefs.join(","),
    candidate.publicationState,
    candidate.coverage,
    candidate.localeEvidence?.countryCode ?? "",
    candidate.localeEvidence?.countryBasis ?? "",
    candidate.localeEvidence?.currencyCode ?? "",
    candidate.localeEvidence?.currencyBasis ?? "",
  ].join(":");

const compareCandidates = (
  left: MenuCacheCandidate,
  right: MenuCacheCandidate,
  requestedCoverage: MenuCacheCoverage,
): number => {
  const leftExact = left.coverage === requestedCoverage ? 0 : 1;
  const rightExact = right.coverage === requestedCoverage ? 0 : 1;
  if (leftExact !== rightExact) return leftExact - rightExact;
  if (left.menuVersion.versionOrdinal !== right.menuVersion.versionOrdinal) {
    return right.menuVersion.versionOrdinal - left.menuVersion.versionOrdinal;
  }
  const collectedOrder = right.menuVersion.collectedAt.localeCompare(
    left.menuVersion.collectedAt,
  );
  if (collectedOrder !== 0) return collectedOrder;
  const validityOrder = right.menuVersion.validFrom.localeCompare(
    left.menuVersion.validFrom,
  );
  if (validityOrder !== 0) return validityOrder;
  const versionIdOrder = left.menuVersion.menuVersionId.localeCompare(
    right.menuVersion.menuVersionId,
  );
  if (versionIdOrder !== 0) return versionIdOrder;
  return stableCandidateKey(left).localeCompare(stableCandidateKey(right));
};

export const evaluateMenuCacheCandidates = (
  resolution: RestaurantResolution,
  menuScope: MenuScope,
  requestedCoverage: MenuCacheCoverage,
  cacheCandidates: readonly MenuCacheCandidate[],
  now: string,
  context: PortInvocationContext,
): PortResult<MenuCacheLookupOutcome> => {
  PortInvocationContextSchema.parse(context);
  const parsedResolution = RestaurantResolutionSchema.safeParse(resolution);
  const nowEpoch = Date.parse(now);
  if (
    !parsedResolution.success ||
    parsedResolution.data.state !== "user_confirmed" ||
    parsedResolution.data.restaurantId === null ||
    parsedResolution.data.selectedCandidateId === null ||
    !MENU_SCOPES.includes(menuScope) ||
    !MENU_CACHE_COVERAGES.includes(requestedCoverage) ||
    !Number.isFinite(nowEpoch)
  ) {
    return { status: "error", error: publicError("INVALID_INPUT", context) };
  }

  const selectedCandidates = parsedResolution.data.candidates.filter(
    (candidate) =>
      candidate.candidateId === parsedResolution.data.selectedCandidateId,
  );
  const selectedCandidate = selectedCandidates[0];
  if (selectedCandidates.length !== 1 || selectedCandidate === undefined) {
    return { status: "error", error: publicError("INVALID_INPUT", context) };
  }

  const normalizedCandidates: MenuCacheCandidate[] = [];
  for (const candidate of cacheCandidates) {
    const parsedMenuVersion = RestaurantMenuVersionSchema.safeParse(
      candidate.menuVersion,
    );
    if (
      !parsedMenuVersion.success ||
      candidate.googlePlaceId.trim().length === 0 ||
      (candidate.publicationState !== "eligible" &&
        candidate.publicationState !== "analysis_only") ||
      !MENU_CACHE_COVERAGES.includes(candidate.coverage) ||
      !validLocaleEvidence(candidate.localeEvidence)
    ) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    normalizedCandidates.push({
      googlePlaceId: candidate.googlePlaceId,
      menuVersion: parsedMenuVersion.data,
      publicationState: candidate.publicationState,
      coverage: candidate.coverage,
      localeEvidence:
        candidate.localeEvidence === null
          ? null
          : { ...candidate.localeEvidence },
    });
  }

  const branchCandidates = normalizedCandidates.filter(
    (candidate) =>
      candidate.googlePlaceId === selectedCandidate.googlePlaceId &&
      candidate.menuVersion.restaurantId ===
        parsedResolution.data.restaurantId &&
      candidate.menuVersion.menuScope === menuScope,
  );

  const freshCandidates = branchCandidates.filter((candidate) => {
    const validFromEpoch = Date.parse(candidate.menuVersion.validFrom);
    const validUntilEpoch =
      candidate.menuVersion.validUntil === null
        ? null
        : Date.parse(candidate.menuVersion.validUntil);
    return (
      candidate.publicationState === "eligible" &&
      candidate.menuVersion.state === "active" &&
      validFromEpoch <= nowEpoch &&
      (validUntilEpoch === null || nowEpoch < validUntilEpoch) &&
      coverageSatisfies(candidate.coverage, requestedCoverage) &&
      !localeConflicts(
        selectedCandidate.localeEvidence,
        candidate.localeEvidence,
      )
    );
  });
  if (freshCandidates.length > 0) {
    const [candidate] = [...freshCandidates].sort((left, right) =>
      compareCandidates(left, right, requestedCoverage),
    );
    if (candidate !== undefined) {
      return { status: "success", value: { kind: "fresh_hit", candidate } };
    }
  }

  const staleCandidates = branchCandidates.filter((candidate) => {
    if (
      candidate.publicationState !== "eligible" ||
      (candidate.menuVersion.state !== "active" &&
        candidate.menuVersion.state !== "stale")
    ) {
      return false;
    }
    const validFromEpoch = Date.parse(candidate.menuVersion.validFrom);
    const validUntilEpoch =
      candidate.menuVersion.validUntil === null
        ? null
        : Date.parse(candidate.menuVersion.validUntil);
    return (
      candidate.menuVersion.state === "stale" ||
      (validFromEpoch <= nowEpoch &&
        validUntilEpoch !== null &&
        nowEpoch >= validUntilEpoch) ||
      !coverageSatisfies(candidate.coverage, requestedCoverage) ||
      localeConflicts(selectedCandidate.localeEvidence, candidate.localeEvidence)
    );
  });
  if (staleCandidates.length > 0) {
    const [candidate] = [...staleCandidates].sort((left, right) =>
      compareCandidates(left, right, requestedCoverage),
    );
    if (candidate !== undefined) {
      return { status: "success", value: { kind: "stale", candidate } };
    }
  }

  return {
    status: "success",
    value: { kind: "cache_miss", candidate: null },
  };
};

export class MenuCacheService {
  constructor(private readonly repository: MenuCacheRepository) {}

  async lookup(
    resolution: RestaurantResolution,
    menuScope: MenuScope,
    requestedCoverage: MenuCacheCoverage,
    now: string,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuCacheLookupOutcome>> {
    PortInvocationContextSchema.parse(context);
    const parsedResolution = RestaurantResolutionSchema.safeParse(resolution);
    if (
      !parsedResolution.success ||
      parsedResolution.data.state !== "user_confirmed" ||
      parsedResolution.data.restaurantId === null ||
      parsedResolution.data.selectedCandidateId === null ||
      !MENU_SCOPES.includes(menuScope) ||
      !MENU_CACHE_COVERAGES.includes(requestedCoverage) ||
      !Number.isFinite(Date.parse(now))
    ) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }

    const selectedCandidates = parsedResolution.data.candidates.filter(
      (candidate) =>
        candidate.candidateId === parsedResolution.data.selectedCandidateId,
    );
    const selectedCandidate = selectedCandidates[0];
    if (selectedCandidates.length !== 1 || selectedCandidate === undefined) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }

    let repositoryResult: PortResult<readonly MenuCacheCandidate[]>;
    try {
      repositoryResult = await this.repository.findCandidates(
        {
          googlePlaceId: selectedCandidate.googlePlaceId,
          restaurantId: parsedResolution.data.restaurantId,
          menuScope,
        },
        context,
      );
    } catch {
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }
    if (repositoryResult.status !== "success") {
      return repositoryResult;
    }

    return evaluateMenuCacheCandidates(
      parsedResolution.data,
      menuScope,
      requestedCoverage,
      repositoryResult.value,
      now,
      context,
    );
  }
}

export class MenuCacheBodyService {
  constructor(
    private readonly cache: MenuCacheService,
    private readonly bodies: MenuCacheBodyRepository,
  ) {}

  async lookup(
    resolution: RestaurantResolution,
    menuScope: MenuScope,
    requestedCoverage: MenuCacheCoverage,
    now: string,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuCacheBodyLookupOutcome>> {
    const cacheResult = await this.cache.lookup(
      resolution,
      menuScope,
      requestedCoverage,
      now,
      context,
    );
    if (cacheResult.status !== "success") {
      return cacheResult;
    }
    if (cacheResult.value.kind === "stale") {
      return { status: "success", value: cacheResult.value };
    }
    if (cacheResult.value.kind === "cache_miss") {
      return { status: "success", value: cacheResult.value };
    }

    const selected = cacheResult.value.candidate;
    let bodyResult: PortResult<MenuCacheBody | null>;
    try {
      bodyResult = await this.bodies.findByMenuVersionId(
        selected.menuVersion.menuVersionId,
        context,
      );
    } catch {
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }
    if (bodyResult.status !== "success") {
      return bodyResult;
    }

    const body = bodyResult.value;
    if (
      body === null ||
      body.menuVersionId !== selected.menuVersion.menuVersionId ||
      body.menuScope !== selected.menuVersion.menuScope ||
      body.coverage !== selected.coverage ||
      !MENU_SCOPES.includes(body.menuScope) ||
      !MENU_CACHE_COVERAGES.includes(body.coverage)
    ) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    const menuItems: MenuItem[] = [];
    for (const item of body.menuItems) {
      const parsedItem = MenuItemSchema.safeParse(item);
      if (
        !parsedItem.success ||
        parsedItem.data.menuVersionId !== body.menuVersionId
      ) {
        return {
          status: "error",
          error: publicError("INVALID_UPSTREAM_RESULT", context),
        };
      }
      menuItems.push(cloneMenuItem(parsedItem.data));
    }

    return {
      status: "success",
      value: {
        kind: "fresh_hit",
        candidate: cloneCandidate(selected),
        body: {
          menuVersionId: body.menuVersionId,
          menuScope: body.menuScope,
          coverage: body.coverage,
          menuItems,
        },
      },
    };
  }
}
