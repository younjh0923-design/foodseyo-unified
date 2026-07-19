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
