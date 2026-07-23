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
  preserveLinkInput,
} from "../src/index.js";
import { storePendingAnalysis, takePendingAnalysis } from "../app/analysis-handoff.js";
import { LanguageSelector, isSupportedRestaurantLink } from "../app/language-selector.jsx";
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

const rejectedResolution = RestaurantResolutionSchema.parse({
  contractVersion: CONTRACT_VERSIONS.restaurantResolution,
  state: "rejected",
  candidates: [],
  selectedCandidateId: null,
  restaurantId: null,
  confirmationEvidence: null,
  requiresUserConfirmation: false,
  canContinueMenuOnly: true,
  resolvedAt: null,
});
const noCandidatePhotoMarkup = renderToStaticMarkup(
  createElement(RestaurantConfirmationPanel, {
    screen: buildRestaurantSelectionScreen(draft, rejectedResolution, "en"),
    language: "en",
  }),
);
assert.match(noCandidatePhotoMarkup, /Continue with menu only/u);
const noCandidateLinkMarkup = renderToStaticMarkup(
  createElement(RestaurantConfirmationPanel, {
    screen: buildRestaurantSelectionScreen(
      preserveLinkInput(createLocalInputDraft(), "https://restaurant.example/menu"),
      rejectedResolution,
      "en",
    ),
    language: "en",
  }),
);
assert.doesNotMatch(noCandidateLinkMarkup, /Continue with menu only/u);

const clientSource = await readFile(resolve("app/restaurant-confirmation/restaurant-confirmation-client.jsx"), "utf8");
const pageSource = await readFile(resolve("app/restaurant-confirmation/page.jsx"), "utf8");
const homeSource = await readFile(resolve("app/language-selector.jsx"), "utf8");
const analyzeRouteSource = await readFile(
  resolve("app/api/analyze/menu-images/route.ts"),
  "utf8",
);
const confirmRouteSource = await readFile(
  resolve("app/api/restaurant/confirm/route.ts"),
  "utf8",
);
const globalStyles = await readFile(resolve("app/globals.css"), "utf8");
assert.match(homeSource, /fetch\("\/api\/analyze\/menu-images"/u);
assert.match(homeSource, /fetch\("\/api\/analyze\/restaurant-link"/u);
assert.match(clientSource, /fetch\("\/api\/restaurant\/confirm"/u);
assert.match(clientSource, /fetch\("\/api\/assistant"/u);
assert.match(clientSource, /onContinueMenuOnly=\{\(\) => confirm\(null\)\}/u);
assert.match(homeSource, /form\.append\("language", language\)/u);
assert.match(clientSource, /document\.documentElement\.lang = language/u);
assert.match(pageSource, /initialLanguage=\{language\}/u);
const englishLanding = renderToStaticMarkup(
  createElement(LanguageSelector, { initialLanguage: "en" }),
);
const koreanLanding = renderToStaticMarkup(
  createElement(LanguageSelector, { initialLanguage: "ko" }),
);
assert.match(englishLanding, /Know what you&#x27;re ordering\./u);
assert.match(englishLanding, /Scan or upload a menu/u);
assert.match(englishLanding, /Paste a restaurant or menu link/u);
assert.match(englishLanding, /type="file"/u);
assert.match(englishLanding, /multiple=""/u);
assert.doesNotMatch(englishLanding, /restaurant-confirmation\?lang=en/u);
assert.match(englishLanding, /aria-pressed="true"[^>]*>EN/u);
assert.match(koreanLanding, /뭐 먹지\?/u);
assert.match(koreanLanding, /메뉴 촬영 또는 업로드/u);
assert.match(koreanLanding, /식당 또는 메뉴 링크 붙여넣기/u);
assert.match(koreanLanding, /type="file"/u);
assert.doesNotMatch(koreanLanding, /restaurant-confirmation\?lang=ko/u);
assert.match(homeSource, /document\.documentElement\.lang = nextLanguage/u);
assert.match(homeSource, /URL\.createObjectURL\(image\)/u);
assert.match(homeSource, /restaurantName\.trim\(\)/u);
assert.match(homeSource, /storePendingAnalysis\(window\.sessionStorage/u);
assert.match(homeSource, /new AbortController\(\)/u);
assert.match(homeSource, /analyzeRequestRef\.current\.id !== requestId/u);
assert.match(homeSource, /window\.addEventListener\("pageshow"/u);
assert.match(homeSource, /if \(!event\.persisted\) return/u);
assert.match(homeSource, /setRestaurantName\(""\)/u);
assert.match(homeSource, /setRestaurantLink\(""\)/u);
assert.equal(isSupportedRestaurantLink("https://restaurant.example/menu"), true);
assert.equal(isSupportedRestaurantLink("http://restaurant.example"), true);
assert.equal(isSupportedRestaurantLink("javascript:alert(1)"), false);
assert.equal(isSupportedRestaurantLink("restaurant.example/menu"), false);
assert.doesNotMatch(clientSource, /type="file"/u);
assert.match(clientSource, /takePendingAnalysis\(window\.sessionStorage\)/u);
assert.match(clientSource, /confirmRequest\.current\.id !== requestId/u);
assert.match(clientSource, /publicError\?\.code === "INVALID_INPUT"/u);
assert.match(clientSource, /publicError\?\.retryable === true/u);
assert.match(clientSource, /event\.persisted/u);
for (const durationField of [
  "request_parse_ms",
  "image_preprocess_ms",
  "extraction_cache_lookup_ms",
  "openai_extraction_ms",
  "restaurant_resolution_ms",
  "canonical_validation_ms",
  "token_build_ms",
  "total_ms",
]) {
  assert.match(analyzeRouteSource, new RegExp(durationField, "u"));
}
for (const durationField of [
  "confirm_cache_lookup_ms",
  "publication_ms",
  "total_ms",
]) {
  assert.match(confirmRouteSource, new RegExp(durationField, "u"));
}
assert.match(analyzeRouteSource, /safe_error_code/u);
assert.match(analyzeRouteSource, /failed_stage/u);
assert.match(confirmRouteSource, /safe_error_code/u);
assert.match(confirmRouteSource, /failed_stage/u);
for (const routeSource of [analyzeRouteSource, confirmRouteSource]) {
  assert.doesNotMatch(
    routeSource,
    /console\.(?:info|error|log)\([^;]*(?:analysisToken|restaurantName|providerResponse|DATABASE_URL|API_KEY)/su,
  );
}
for (const forbidden of ["Fixture", "preview-toolbar", "fixture-banner", "setTimeout"] as const) {
  assert.equal(clientSource.includes(forbidden), false);
  assert.equal(pageSource.includes(forbidden), false);
}
assert.match(globalStyles, /min-width:\s*320px/u);
assert.match(globalStyles, /min-height:\s*44px/u);
assert.match(globalStyles, /\.language-switcher/u);
assert.match(
  globalStyles,
  /\.language-switcher button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/su,
);
assert.match(globalStyles, /\.upload-entry-card/u);
assert.match(globalStyles, /\.link-field-row/u);
assert.match(globalStyles, /\.selected-photo-card/u);
assert.match(globalStyles, /\.detail-sheet/u);
assert.match(globalStyles, /\.assistant-sheet/u);
assert.match(globalStyles, /:focus-visible/u);

const storageValues = new Map<string, string>();
const storage = {
  getItem: (key: string) => storageValues.get(key) ?? null,
  setItem: (key: string, value: string) => storageValues.set(key, value),
  removeItem: (key: string) => storageValues.delete(key),
};
const pendingAnalysis = {
  analysisToken: "encrypted-token",
  restaurantScreen: englishScreen,
  language: "en",
};
assert.equal(storePendingAnalysis(storage, pendingAnalysis), true);
assert.deepEqual(takePendingAnalysis(storage), pendingAnalysis);
assert.equal(takePendingAnalysis(storage), null);

console.log("Foodseyo bilingual live restaurant confirmation UI checks passed.");
