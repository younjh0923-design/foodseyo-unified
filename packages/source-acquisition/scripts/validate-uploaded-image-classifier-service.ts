import assert from "node:assert/strict";

import {
  MODULE_INTERFACE_VERSION,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  type PortInvocationContext,
} from "@foodseyo/contracts";

import {
  FakeUploadedImageClassifier,
  UploadedImageReuseService,
  type UploadedImageClassifier,
  type UploadedImageObservation,
  type UploadedImageReference,
} from "../src/index.js";

const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `uploaded_image_classifier_${name}`,
  timeoutMs: 5_000,
  signal: new AbortController().signal,
});
const reference: UploadedImageReference = {
  kind: "image_collection",
  contentHandle: "content:uploaded-image-classifier",
  sensitivity: "sensitive_transient",
  byteCount: 2_048,
  pageCount: null,
};
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
const serviceFor = (value: UploadedImageObservation) => {
  const classifier = new FakeUploadedImageClassifier({
    status: "success",
    value,
  });
  return { classifier, service: new UploadedImageReuseService(classifier) };
};

const fullFixture = serviceFor(
  observation({
    menuTextDetected: true,
    dishNamesDetected: true,
    pricesDetected: true,
    multipleMenuSectionsDetected: true,
    cropCompleteness: "complete",
  }),
);
const referenceSnapshot = structuredClone(reference);
const full = await fullFixture.service.classify(
  reference,
  context("full"),
);
assert.equal(full.status, "success");
if (full.status !== "success") throw new Error("full classifier failed");
assert.equal(full.value.kind, "menu_full");
assert.deepEqual(fullFixture.classifier.lastReference, reference);
assert.deepEqual(reference, referenceSnapshot);

const partial = await serviceFor(
  observation({
    menuTextDetected: true,
    pricesDetected: true,
    cropCompleteness: "partial",
  }),
).service.classify(reference, context("partial"));
assert.equal(partial.status, "success");
if (partial.status !== "success") throw new Error("partial classifier failed");
assert.equal(partial.value.kind, "menu_partial");

const storefront = await serviceFor(
  observation({
    storefrontSignDetected: true,
    restaurantNameDetected: true,
    cropCompleteness: "complete",
  }),
).service.classify(reference, context("storefront"));
assert.equal(storefront.status, "success");
if (storefront.status !== "success") {
  throw new Error("storefront classifier failed");
}
assert.equal(storefront.value.kind, "storefront");

const unknown = await serviceFor(
  observation({ imageReadable: false, confidence: 0.2 }),
).service.classify(reference, context("unknown"));
assert.equal(unknown.status, "success");
if (unknown.status !== "success") throw new Error("unknown classifier failed");
assert.equal(unknown.value.kind, "unknown");

const failureDefinition = PUBLIC_ERROR_REGISTRY.UPSTREAM_UNAVAILABLE;
const classifierFailure = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_UNAVAILABLE",
    message: failureDefinition.message,
    correlationId: "uploaded_image_classifier_failure",
    retryable: failureDefinition.retryable,
  },
  httpStatus: failureDefinition.httpStatus,
});
const failingClassifier = new FakeUploadedImageClassifier({
  status: "error",
  error: classifierFailure,
});
const failure = await new UploadedImageReuseService(
  failingClassifier,
).classify(reference, context("failure"));
assert.equal(failure.status, "error");
if (failure.status !== "error") throw new Error("classifier failure was lost");
assert.equal(failure.error, classifierFailure);

const malformedObservation = observation({ confidence: Number.NaN });
const malformedClassifier: UploadedImageClassifier = {
  observe: () =>
    Promise.resolve({ status: "success", value: malformedObservation }),
};
const malformed = await new UploadedImageReuseService(
  malformedClassifier,
).classify(reference, context("malformed"));
assert.equal(malformed.status, "error");
if (malformed.status !== "error") {
  throw new Error("malformed observation must fail");
}
assert.equal(malformed.error.error.code, "INVALID_UPSTREAM_RESULT");

const sharedObservation = observation({
  menuTextDetected: true,
  pricesDetected: true,
  cropCompleteness: "partial",
});
const sharedObservationSnapshot = structuredClone(sharedObservation);
const sharedClassifier: UploadedImageClassifier = {
  observe: () =>
    Promise.resolve({ status: "success", value: sharedObservation }),
};
const sharedResult = await new UploadedImageReuseService(
  sharedClassifier,
).classify(reference, context("immutable-observation"));
assert.equal(sharedResult.status, "success");
assert.deepEqual(sharedObservation, sharedObservationSnapshot);

const deterministicAgain = await fullFixture.service.classify(
  reference,
  context("deterministic"),
);
assert.equal(deterministicAgain.status, "success");
if (deterministicAgain.status !== "success") {
  throw new Error("deterministic classifier failed");
}
assert.deepEqual(deterministicAgain.value, full.value);
assert.equal(fullFixture.classifier.callCount, 2);

assert.deepEqual(Object.keys(reference).sort(), [
  "byteCount",
  "contentHandle",
  "kind",
  "pageCount",
  "sensitivity",
]);
const serializedOutput = JSON.stringify([
  full.value,
  partial.status === "success" ? partial.value : null,
  storefront.status === "success" ? storefront.value : null,
]);
for (const forbidden of [
  "contentHandle",
  "restaurantName",
  "restaurantId",
  "googlePlaceId",
  "matchSignals",
  "address",
  "location",
  "rank",
]) {
  assert.equal(serializedOutput.includes(forbidden), false, forbidden);
}

console.log("Uploaded image classifier service validation passed.");
