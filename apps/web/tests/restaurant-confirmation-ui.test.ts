import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CONTRACT_VERSIONS, RestaurantResolutionSchema } from "@foodseyo/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  addLocalPhoto,
  buildRestaurantSelectionScreen,
  createLocalInputDraft,
} from "../src/index.js";
import { RestaurantConfirmationPanel } from "../app/restaurant-confirmation/restaurant-confirmation-client.jsx";

const candidateId = "11111111-1111-4111-8111-111111111111";
const privatePlaceId = "private-google-place-id";
const draft = addLocalPhoto(createLocalInputDraft(), "uploaded-menu-photo", 2048);
const candidateScreen = buildRestaurantSelectionScreen(
  draft,
  RestaurantResolutionSchema.parse({
    contractVersion: CONTRACT_VERSIONS.restaurantResolution,
    state: "candidate",
    candidates: [
      {
        contractVersion: CONTRACT_VERSIONS.restaurantResolution,
        candidateId,
        googlePlaceId: privatePlaceId,
        displayName: "Harbor Noodle House",
        fullAddress: "18 Pier Street, Boston, MA",
        shortAddress: "18 Pier Street",
        location: { latitude: 42.3601, longitude: -71.0589 },
        matchSignals: ["name", "address", "visual_text"],
        rank: 1,
      },
    ],
    selectedCandidateId: null,
    restaurantId: null,
    confirmationEvidence: null,
    requiresUserConfirmation: true,
    canContinueMenuOnly: true,
    resolvedAt: null,
  }),
);

const renderPanel = (options: {
  readonly selectedCandidateId?: string | null;
  readonly submissionState?: "idle" | "loading" | "error";
  readonly statusMessage?: string;
} = {}) =>
  renderToStaticMarkup(
    createElement(RestaurantConfirmationPanel, {
      screen: candidateScreen,
      selectedCandidateId: options.selectedCandidateId ?? null,
      submissionState: options.submissionState ?? "idle",
      statusMessage: options.statusMessage ?? "",
    }),
  );

const initialMarkup = renderPanel();
assert.match(initialMarkup, /Harbor Noodle House/);
assert.match(initialMarkup, /직접 선택하기 전에는/);
assert.match(initialMarkup, /aria-pressed="false"/);
assert.match(initialMarkup, /네, 이 식당이에요/);
assert.match(initialMarkup, /disabled=""/);
assert.doesNotMatch(initialMarkup, new RegExp(privatePlaceId, "u"));
assert.doesNotMatch(initialMarkup, /Fixture|미리보기|브라우저 안에서만/u);

const selectedMarkup = renderPanel({ selectedCandidateId: candidateId });
assert.match(selectedMarkup, /aria-pressed="true"/);
assert.match(selectedMarkup, /선택됨/);
const confirmButton = selectedMarkup.match(
  /<button class="primary-button"[^>]*>네, 이 식당이에요<\/button>/u,
)?.[0];
assert(confirmButton);
assert.equal(confirmButton.includes("disabled"), false);

const loadingMarkup = renderPanel({
  selectedCandidateId: candidateId,
  submissionState: "loading",
});
assert.match(loadingMarkup, /aria-busy="true"/);
assert.match(loadingMarkup, /식당을 확인하고 메뉴를 저장하는 중/);
assert.match(loadingMarkup, /저장 중/);

const errorMarkup = renderPanel({
  selectedCandidateId: candidateId,
  submissionState: "error",
  statusMessage: "안전한 공개 오류",
});
assert.match(errorMarkup, /role="alert"/);
assert.match(errorMarkup, /안전한 공개 오류/);
assert.match(errorMarkup, /aria-pressed="true"/);

const rejectedScreen = buildRestaurantSelectionScreen(
  draft,
  RestaurantResolutionSchema.parse({
    contractVersion: CONTRACT_VERSIONS.restaurantResolution,
    state: "rejected",
    candidates: [],
    selectedCandidateId: null,
    restaurantId: null,
    confirmationEvidence: null,
    requiresUserConfirmation: false,
    canContinueMenuOnly: true,
    resolvedAt: null,
  }),
);
const rejectedMarkup = renderToStaticMarkup(
  createElement(RestaurantConfirmationPanel, { screen: rejectedScreen }),
);
assert.match(rejectedMarkup, /일치하는 식당 후보를 찾지 못했어요/);
assert.match(rejectedMarkup, /다른 사진으로 다시 찾기/);
assert.doesNotMatch(rejectedMarkup, /네, 이 식당이에요/);

const clientSource = await readFile(
  resolve("app/restaurant-confirmation/restaurant-confirmation-client.jsx"),
  "utf8",
);
const pageSource = await readFile(resolve("app/restaurant-confirmation/page.jsx"), "utf8");
const globalStyles = await readFile(resolve("app/globals.css"), "utf8");
assert.match(clientSource, /fetch\("\/api\/analyze\/menu-images"/u);
assert.match(clientSource, /fetch\("\/api\/restaurant\/confirm"/u);
assert.match(clientSource, /confirmationInFlight\.current/u);
assert.match(clientSource, /setSelectedCandidateId\(null\)/u);
for (const forbidden of ["Fixture", "preview-toolbar", "fixture-banner", "setTimeout"] as const) {
  assert.equal(clientSource.includes(forbidden), false);
  assert.equal(pageSource.includes(forbidden), false);
}
assert.doesNotMatch(pageSource, /fixtures\//u);
assert.match(globalStyles, /min-width:\s*320px/u);
assert.match(globalStyles, /width:\s*min\(100% - 2rem, 30rem\)/u);
assert.match(globalStyles, /min-height:\s*44px/u);
assert.match(globalStyles, /:focus-visible/u);
assert.doesNotMatch(globalStyles, /preview-toolbar|fixture-banner/u);

console.log("Foodseyo live 식당 확인 UI 경계 검증을 통과했습니다.");
