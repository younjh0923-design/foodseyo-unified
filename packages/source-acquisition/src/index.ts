import {
  MenuSourceAcquisitionRequestSchema,
  MenuSourceInputSchema,
  parseDeterministicFakePlan,
  selectDeterministicFakeResult,
  type DeterministicFakePlan,
  type MenuSourceAcquisitionPort,
  type MenuSourceAcquisitionRequest,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
} from "@foodseyo/contracts";

export {
  FoundationMenuSourceAcquisitionPort,
  OfficialPdfDiscoveryAdapter,
  OfficialWebsiteDiscoveryAdapter,
  OrderingPageDiscoveryAdapter,
  UploadedMenuSourceAdapter,
  WebSearchDiscoveryAdapter,
  isSafePublicHttpsSourceUrl,
  type MenuSourceCandidateAdapter,
  type MenuSourceDiscoveryPort,
  type SourceAcquisitionDependencies,
  type TransientContentIdentity,
  type TransientContentIdentityPort,
  type TransientDiscoveredMenuSource,
} from "./foundation.js";
export {
  InMemoryMenuCacheBodyRepository,
  InMemoryMenuCacheRepository,
  MENU_CACHE_COVERAGES,
  MenuCacheBodyService,
  MenuCacheService,
  evaluateMenuCacheCandidates,
  type MenuCacheCandidate,
  type MenuCacheBody,
  type MenuCacheBodyLookupOutcome,
  type MenuCacheBodyRepository,
  type MenuCacheCoverage,
  type MenuCacheLookupOutcome,
  type MenuCacheRepository,
  type MenuCacheRepositoryLookup,
} from "./menu-cache.js";
export {
  MenuAcquisitionReuseService,
  type MenuAcquisitionReuseInput,
  type MenuAcquisitionReuseOutcome,
} from "./menu-acquisition-reuse.js";
export {
  MenuAcquisitionStrategy,
  decideMenuAcquisitionStrategy,
} from "./menu-acquisition-strategy.js";
export {
  MenuAcquisitionStrategyExecutionService,
  type MenuAcquisitionStrategyExecutionInput,
  type MenuAcquisitionStrategyExecutionOutcome,
} from "./menu-acquisition-strategy-execution.js";
export {
  FakeOfficialMenuSourceDiscovery,
  OFFICIAL_MENU_SOURCE_KINDS,
  OfficialMenuSourceDiscoveryService,
  type OfficialMenuSourceCandidate,
  type OfficialMenuSourceDiscovery,
  type OfficialMenuSourceDiscoveryRequest,
  type OfficialMenuSourceKind,
} from "./official-menu-source-discovery.js";
export {
  FakeUploadedImageClassifier,
  MIN_UPLOADED_IMAGE_CLASSIFICATION_CONFIDENCE,
  UPLOADED_IMAGE_CROP_COMPLETENESS,
  UploadedImageReuseService,
  classifyUploadedImageReuse,
  type UploadedImageClassifier,
  type UploadedImageCropCompleteness,
  type UploadedImageObservation,
  type UploadedImageReference,
  type UploadedImageReuseClassification,
  type UploadedImageReuseOutcome,
} from "./uploaded-image-classification.js";

export class FakeMenuSourceAcquisitionPort
  implements MenuSourceAcquisitionPort
{
  #callCount = 0;
  private readonly plan: DeterministicFakePlan<MenuSourceInput>;

  constructor(
    plan: DeterministicFakePlan<MenuSourceInput>,
  ) {
    this.plan = parseDeterministicFakePlan(plan, MenuSourceInputSchema);
  }

  get callCount(): number {
    return this.#callCount;
  }

  acquire(
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuSourceInput>> {
    this.#callCount += 1;
    MenuSourceAcquisitionRequestSchema.parse(request);
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}
