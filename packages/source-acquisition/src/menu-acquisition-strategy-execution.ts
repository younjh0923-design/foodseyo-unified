import type { PortInvocationContext, PortResult } from "@foodseyo/contracts";

import type { MenuAcquisitionReuseOutcome } from "./menu-acquisition-reuse.js";
import {
  MenuAcquisitionStrategy,
  decideMenuAcquisitionStrategy,
} from "./menu-acquisition-strategy.js";
import {
  OfficialMenuSourceDiscoveryService,
  type OfficialMenuSourceCandidate,
  type OfficialMenuSourceDiscoveryRequest,
} from "./official-menu-source-discovery.js";

export interface MenuAcquisitionStrategyExecutionInput {
  readonly reuseOutcome: MenuAcquisitionReuseOutcome;
  readonly discoveryRequest: OfficialMenuSourceDiscoveryRequest;
}

export type MenuAcquisitionStrategyExecutionOutcome =
  | {
      readonly kind: "use_cache";
      readonly reuseOutcome: MenuAcquisitionReuseOutcome;
    }
  | {
      readonly kind: "reuse_uploaded_image";
      readonly reuseOutcome: MenuAcquisitionReuseOutcome;
    }
  | {
      readonly kind: "official_sources";
      readonly reuseOutcome: MenuAcquisitionReuseOutcome;
      readonly sources: readonly OfficialMenuSourceCandidate[];
    }
  | {
      readonly kind: "wait_for_next_stage";
      readonly reuseOutcome: MenuAcquisitionReuseOutcome;
    };

const cloneSource = (
  source: OfficialMenuSourceCandidate,
): OfficialMenuSourceCandidate => ({ ...source });

/** Executes only the side-effect boundary selected by the pure strategy decision. */
export class MenuAcquisitionStrategyExecutionService {
  constructor(
    private readonly officialSources: OfficialMenuSourceDiscoveryService,
  ) {}

  async execute(
    input: MenuAcquisitionStrategyExecutionInput,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuAcquisitionStrategyExecutionOutcome>> {
    const strategy = decideMenuAcquisitionStrategy(input.reuseOutcome);

    switch (strategy) {
      case MenuAcquisitionStrategy.USE_CACHE:
        return {
          status: "success",
          value: { kind: "use_cache", reuseOutcome: input.reuseOutcome },
        };
      case MenuAcquisitionStrategy.REUSE_UPLOADED_IMAGE:
        return {
          status: "success",
          value: {
            kind: "reuse_uploaded_image",
            reuseOutcome: input.reuseOutcome,
          },
        };
      case MenuAcquisitionStrategy.WAIT_FOR_NEXT_STAGE:
        return {
          status: "success",
          value: {
            kind: "wait_for_next_stage",
            reuseOutcome: input.reuseOutcome,
          },
        };
      case MenuAcquisitionStrategy.DISCOVER_OFFICIAL_SOURCE: {
        const discoveryResult = await this.officialSources.discover(
          input.discoveryRequest,
          context,
        );
        if (discoveryResult.status !== "success") {
          return discoveryResult;
        }
        return {
          status: "success",
          value: {
            kind: "official_sources",
            reuseOutcome: input.reuseOutcome,
            sources: discoveryResult.value.map(cloneSource),
          },
        };
      }
    }
  }
}
