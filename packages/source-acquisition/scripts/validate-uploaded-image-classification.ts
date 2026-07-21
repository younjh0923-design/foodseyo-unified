import assert from "node:assert/strict";

import {
  classifyUploadedImageReuse,
  type UploadedImageObservation,
} from "../src/index.js";

const observation = (
  overrides: Partial<UploadedImageObservation> = {},
): UploadedImageObservation => ({
  imageReadable: true,
  menuTextDetected: false,
  dishNamesDetected: false,
  pricesDetected: false,
  multipleMenuSectionsDetected: false,
  fullMenuScopeDetected: false,
  storefrontSignDetected: false,
  restaurantNameDetected: false,
  cropCompleteness: "unknown",
  confidence: 0.9,
  ...overrides,
});

const full = classifyUploadedImageReuse(
  observation({
    menuTextDetected: true,
    dishNamesDetected: true,
    pricesDetected: true,
    multipleMenuSectionsDetected: true,
    cropCompleteness: "complete",
  }),
);
assert.equal(full.kind, "menu_full");

const partial = classifyUploadedImageReuse(
  observation({
    menuTextDetected: true,
    dishNamesDetected: true,
    pricesDetected: true,
    cropCompleteness: "partial",
  }),
);
assert.equal(partial.kind, "menu_partial");

const storefront = classifyUploadedImageReuse(
  observation({
    storefrontSignDetected: true,
    restaurantNameDetected: true,
    cropCompleteness: "complete",
  }),
);
assert.equal(storefront.kind, "storefront");

const unreadable = classifyUploadedImageReuse(
  observation({
    imageReadable: false,
    confidence: 0.9,
  }),
);
assert.equal(unreadable.kind, "unknown");

const menuBeforeStorefront = classifyUploadedImageReuse(
  observation({
    menuTextDetected: true,
    pricesDetected: true,
    storefrontSignDetected: true,
    restaurantNameDetected: true,
    cropCompleteness: "partial",
  }),
);
assert.equal(menuBeforeStorefront.kind, "menu_partial");

const incompleteFullSignals = classifyUploadedImageReuse(
  observation({
    menuTextDetected: true,
    dishNamesDetected: true,
    pricesDetected: true,
    multipleMenuSectionsDetected: true,
    cropCompleteness: "partial",
  }),
);
assert.equal(incompleteFullSignals.kind, "menu_partial");

const lowConfidence = classifyUploadedImageReuse(
  observation({
    menuTextDetected: true,
    dishNamesDetected: true,
    pricesDetected: true,
    multipleMenuSectionsDetected: true,
    cropCompleteness: "complete",
    confidence: 0.59,
  }),
);
assert.equal(lowConfidence.kind, "unknown");

const contradictory = classifyUploadedImageReuse(
  observation({
    multipleMenuSectionsDetected: true,
    storefrontSignDetected: true,
  }),
);
assert.equal(contradictory.kind, "unknown");

const immutableInput = observation({
  menuTextDetected: true,
  fullMenuScopeDetected: true,
  pricesDetected: true,
  cropCompleteness: "sufficient",
});
const immutableSnapshot = structuredClone(immutableInput);
const first = classifyUploadedImageReuse(immutableInput);
const second = classifyUploadedImageReuse(immutableInput);
assert.equal(first.kind, "menu_full");
assert.deepEqual(second, first);
assert.deepEqual(immutableInput, immutableSnapshot);

console.log("Uploaded image reuse classification validation passed.");
