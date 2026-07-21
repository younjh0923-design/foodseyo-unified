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
  FakeOfficialMenuSourceDiscovery,
  OFFICIAL_MENU_SOURCE_KINDS,
  OfficialMenuSourceDiscoveryService,
  type OfficialMenuSourceCandidate,
  type OfficialMenuSourceDiscovery,
  type OfficialMenuSourceDiscoveryRequest,
  type OfficialMenuSourceKind,
  type VerifiedOfficialMenuSourceDiscovery,
} from "./official-menu-source-discovery.js";
export {
  OfficialMenuCollectorKind,
  verifyOfficialMenuCollectorSelection,
  selectOfficialMenuCollector,
  selectOfficialMenuCollectors,
  type OfficialMenuCollectorSelection,
  type VerifiedOfficialMenuCollectorSelection,
} from "./official-menu-collector-selection.js";
export {
  FakeHtmlMenuPageCollector,
  FakeOrderPageCollector,
  FakePdfMenuCollector,
  OfficialMenuCollectorService,
  type OfficialMenuCollector,
} from "./official-menu-collector.js";
export {
  createBoundedOfficialMenuAcquisitionRuntime,
  type BoundedOfficialMenuAcquisitionDependencies,
  type BoundedOfficialMenuAcquisitionRuntime,
  type OfficialMenuDnsResolver,
  type OfficialMenuHttpTransport,
  type OfficialMenuRetrievalLimits,
  type OfficialMenuTransportRequest,
  type OfficialMenuTransportResponse,
} from "./official-menu-bounded-retrieval.js";
export {
  OfficialMenuSourceAcquisitionOrchestrator,
  type OfficialMenuSourceAcquisitionOrchestrationInput,
} from "./official-menu-source-acquisition-orchestrator.js";

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
