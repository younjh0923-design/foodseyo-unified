import {
  CONTRACT_VERSIONS,
  CanonicalMenuAnalysisSchema,
  type CanonicalMenuAnalysis,
  type CanonicalValidationRequest,
} from "@foodseyo/contracts";

export interface CanonicalMenuBuildOptions {
  readonly analysisId: string;
  readonly validatedAt: string;
  readonly menuVersionId: string | null;
  readonly menuItemIds: readonly string[];
  readonly versionOrdinal?: number;
  readonly supersedesMenuVersionId?: string | null;
}

export const buildCanonicalMenuAnalysis = (
  request: CanonicalValidationRequest,
  options: CanonicalMenuBuildOptions,
): CanonicalMenuAnalysis => {
  const extractedItems = request.extraction.sections.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      sectionIndex: section.sectionIndex,
    })),
  );
  if (options.menuItemIds.length !== extractedItems.length) {
    throw new RangeError("one menu item ID is required for every extracted item");
  }

  const confirmedContext = request.extraction.restaurantContext;
  const isEligible = confirmedContext !== null;
  if (
    isEligible !== (options.menuVersionId !== null) ||
    (isEligible && confirmedContext.restaurantId === null)
  ) {
    throw new TypeError("eligible canonical construction requires confirmed restaurant context");
  }

  return CanonicalMenuAnalysisSchema.parse({
    contractVersion: CONTRACT_VERSIONS.boundaryDtos,
    analysisId: options.analysisId,
    source: request.extraction.source,
    restaurantResolution: request.restaurantResolution,
    publicationState: isEligible ? "eligible" : "analysis_only",
    menuVersion:
      confirmedContext === null || options.menuVersionId === null
        ? null
        : {
            menuVersionId: options.menuVersionId,
            restaurantId: confirmedContext.restaurantId,
            menuScope: request.extraction.menuScope,
            state: "active",
            versionOrdinal: options.versionOrdinal ?? 1,
            sourceRefs: [request.extraction.source.sourceRef],
            collectedAt: request.extraction.source.collectedAt,
            validFrom: request.extraction.source.collectedAt,
            validUntil: null,
            supersedesMenuVersionId: options.supersedesMenuVersionId ?? null,
          },
    menuItems: extractedItems.map((item, index) => ({
      menuItemId: options.menuItemIds[index],
      menuVersionId: options.menuVersionId,
      sectionIndex: item.sectionIndex,
      itemIndex: item.itemIndex,
      name: item.name,
      description: item.description,
      price: item.price,
      optionTexts: item.optionTexts,
      sourceEvidence: item.sourceEvidence,
    })),
    dishCandidates: [],
    dishMatches: [],
    menuItemClaims: [],
    dishClaims: [],
    effectiveProfiles: [],
    warningCodes: request.extraction.warningCodes,
    validatedAt: options.validatedAt,
  });
};
