import {
  type PortInvocationContext,
  type PortResult,
  type RestaurantCandidate,
  type RestaurantResolution,
  type RestaurantResolutionPort,
  type RestaurantResolutionRequest,
} from "@foodseyo/contracts";

import {
  GooglePlacesCandidateFinder,
  type ServerRestaurantClues,
} from "./foundation.js";

/** Connects candidate discovery to the frozen restaurant-resolution boundary. */
export class RestaurantResolutionService {
  constructor(
    private readonly candidateFinder: GooglePlacesCandidateFinder,
    private readonly resolution: RestaurantResolutionPort,
  ) {}

  async resolve(
    clues: ServerRestaurantClues,
    request: RestaurantResolutionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<RestaurantResolution>> {
    let candidates: readonly RestaurantCandidate[];

    if (request.priorResolution !== null) {
      // Confirmation must retain the candidate IDs shown to the user.
      candidates = [...request.priorResolution.candidates];
    } else if (request.candidates.length > 0) {
      candidates = [...request.candidates];
    } else {
      const discovery = await this.candidateFinder.findCandidates(clues, context);
      if (discovery.status !== "success") {
        return discovery;
      }
      candidates = discovery.value;
    }

    return this.resolution.resolve(
      { ...request, candidates: [...candidates] },
      context,
    );
  }
}
