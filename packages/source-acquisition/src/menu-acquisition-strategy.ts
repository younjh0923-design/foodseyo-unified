import type { MenuAcquisitionReuseOutcome } from "./menu-acquisition-reuse.js";

export enum MenuAcquisitionStrategy {
  USE_CACHE = "USE_CACHE",
  REUSE_UPLOADED_IMAGE = "REUSE_UPLOADED_IMAGE",
  DISCOVER_OFFICIAL_SOURCE = "DISCOVER_OFFICIAL_SOURCE",
  WAIT_FOR_NEXT_STAGE = "WAIT_FOR_NEXT_STAGE",
}

/** Selects the next stage without invoking acquisition or changing its evidence. */
export const decideMenuAcquisitionStrategy = (
  outcome: MenuAcquisitionReuseOutcome,
): MenuAcquisitionStrategy => {
  if (outcome.kind === "fresh_cache") {
    return MenuAcquisitionStrategy.USE_CACHE;
  }

  if (outcome.uploadedImage === null) {
    return outcome.kind === "stale_cache"
      ? MenuAcquisitionStrategy.DISCOVER_OFFICIAL_SOURCE
      : MenuAcquisitionStrategy.WAIT_FOR_NEXT_STAGE;
  }

  return outcome.uploadedImage.kind === "menu_full" ||
    outcome.uploadedImage.kind === "menu_partial"
    ? MenuAcquisitionStrategy.REUSE_UPLOADED_IMAGE
    : MenuAcquisitionStrategy.DISCOVER_OFFICIAL_SOURCE;
};
