import type {
  MenuScope,
  PortInvocationContext,
  PortResult,
  RestaurantResolution,
} from "@foodseyo/contracts";

import {
  MenuCacheBodyService,
  type MenuCacheBody,
  type MenuCacheCandidate,
  type MenuCacheCoverage,
} from "./menu-cache.js";
import {
  UploadedImageReuseService,
  type UploadedImageReference,
  type UploadedImageReuseOutcome,
} from "./uploaded-image-classification.js";

export interface MenuAcquisitionReuseInput {
  readonly resolution: RestaurantResolution;
  readonly menuScope: MenuScope;
  readonly requestedCoverage: MenuCacheCoverage;
  readonly now: string;
  readonly uploadedImageReference: UploadedImageReference | null;
}

export type MenuAcquisitionReuseOutcome =
  | {
      readonly kind: "fresh_cache";
      readonly candidate: MenuCacheCandidate;
      readonly body: MenuCacheBody;
    }
  | {
      readonly kind: "stale_cache";
      readonly candidate: MenuCacheCandidate;
      readonly uploadedImage: UploadedImageReuseOutcome | null;
    }
  | {
      readonly kind: "cache_miss";
      readonly uploadedImage: UploadedImageReuseOutcome | null;
    };

/**
 * Chooses reusable inputs for the next acquisition step without starting it.
 * Cache and image classification semantics remain owned by the injected services.
 */
export class MenuAcquisitionReuseService {
  constructor(
    private readonly cache: MenuCacheBodyService,
    private readonly uploadedImages: UploadedImageReuseService,
  ) {}

  async resolve(
    input: MenuAcquisitionReuseInput,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuAcquisitionReuseOutcome>> {
    const cacheResult = await this.cache.lookup(
      input.resolution,
      input.menuScope,
      input.requestedCoverage,
      input.now,
      context,
    );
    if (cacheResult.status !== "success") {
      return cacheResult;
    }

    if (cacheResult.value.kind === "fresh_hit") {
      return {
        status: "success",
        value: {
          kind: "fresh_cache",
          candidate: cacheResult.value.candidate,
          body: cacheResult.value.body,
        },
      };
    }

    const uploadedImage =
      input.uploadedImageReference === null
        ? null
        : await this.uploadedImages.classify(
            input.uploadedImageReference,
            context,
          );
    if (uploadedImage !== null && uploadedImage.status !== "success") {
      return uploadedImage;
    }

    const uploadedImageValue =
      uploadedImage === null ? null : uploadedImage.value;
    if (cacheResult.value.kind === "stale") {
      return {
        status: "success",
        value: {
          kind: "stale_cache",
          candidate: cacheResult.value.candidate,
          uploadedImage: uploadedImageValue,
        },
      };
    }

    return {
      status: "success",
      value: {
        kind: "cache_miss",
        uploadedImage: uploadedImageValue,
      },
    };
  }
}
