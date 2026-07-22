import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CONTRACT_VERSIONS, RestaurantResolutionSchema } from "@foodseyo/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { addLocalPhoto, buildRestaurantSelectionScreen, createLocalInputDraft } from "../src/index.js";
import { RestaurantConfirmationPanel } from "../app/restaurant-confirmation/restaurant-confirmation-client.jsx";

const candidateId = "11111111-1111-4111-8111-111111111111";
const privatePlaceId = "private-google-place-id";
const draft = addLocalPhoto(createLocalInputDraft(), "uploaded-menu-photo", 2048);
const resolution = RestaurantResolutionSchema.parse({
  contractVersion: CONTRACT_VERSIONS.restaurantResolution,
  state: "candidate",
  candidates: [{
    contractVersion: CONTRACT_VERSIONS.restaurantResolution,
    candidateId,
    googlePlaceId: privatePlaceId,
    displayName: "Harbor Noodle House",
    fullAddress: "18 Pier Street, Boston, MA",
    shortAddress: "18 Pier Street",
    location: { latitude: 42.3601, longitude: -71.0589 },
    matchSignals: ["name", "address", "visual_text"],
    rank: 1,
  }],
  selectedCandidateId: null,
  restaurantId: null,
  confirmationEvidence: null,
  requiresUserConfirmation: true,
  canContinueMenuOnly: true,
  resolvedAt: null,
});

const koreanScreen = buildRestaurantSelectionScreen(draft, resolution, "ko");
const englishScreen = buildRestaurantSelectionScreen(draft, resolution, "en");
const renderPanel = (language: "en" | "ko", selectedCandidateId: string | null = null) =>
  renderToStaticMarkup(createElement(RestaurantConfirmationPanel, {
    screen: language === "en" ? englishScreen : koreanScreen,
    language,
    selectedCandidateId,
  }));

const koreanMarkup = renderPanel("ko");
assert.match(koreanMarkup, /식당 지점을 확인해 주세요/u);
assert.match(koreanMarkup, /직접 선택하기 전에는/u);
assert.match(koreanMarkup, /aria-pressed="false"/u);
assert.doesNotMatch(koreanMarkup, new RegExp(privatePlaceId, "u"));

const englishMarkup = renderPanel("en");
assert.match(englishMarkup, /Which restaurant is this\?/u);
assert.match(englishMarkup, /Confirm the restaurant location/u);
assert.match(englishMarkup, /Use this restaurant/u);
assert.doesNotMatch(englishMarkup, /식당 지점을 확인해 주세요/u);

const selectedMarkup = renderPanel("en", candidateId);
assert.match(selectedMarkup, /aria-pressed="true"/u);
const confirmButton = selectedMarkup.match(
  /<button class="primary-button"[^>]*>Use this restaurant<\/button>/u,
)?.[0];
assert(confirmButton);
assert.equal(confirmButton.includes("disabled"), false);

const clientSource = await readFile(resolve("app/restaurant-confirmation/restaurant-confirmation-client.jsx"), "utf8");
const pageSource = await readFile(resolve("app/restaurant-confirmation/page.jsx"), "utf8");
const homeSource = await readFile(resolve("app/language-selector.jsx"), "utf8");
const globalStyles = await readFile(resolve("app/globals.css"), "utf8");
assert.match(clientSource, /fetch\("\/api\/analyze\/menu-images"/u);
assert.match(clientSource, /fetch\("\/api\/restaurant\/confirm"/u);
assert.match(clientSource, /form\.append\("language", language\)/u);
assert.match(clientSource, /document\.documentElement\.lang = language/u);
assert.match(pageSource, /initialLanguage=\{language\}/u);
assert.match(homeSource, /English/u);
assert.match(homeSource, /한국어/u);
assert.match(homeSource, /restaurant-confirmation\?lang=\$\{language\}/u);
for (const forbidden of ["Fixture", "preview-toolbar", "fixture-banner", "setTimeout"] as const) {
  assert.equal(clientSource.includes(forbidden), false);
  assert.equal(pageSource.includes(forbidden), false);
}
assert.match(globalStyles, /min-width:\s*320px/u);
assert.match(globalStyles, /min-height:\s*44px/u);
assert.match(globalStyles, /\.language-options/u);
assert.match(globalStyles, /:focus-visible/u);

console.log("Foodseyo bilingual live restaurant confirmation UI checks passed.");
