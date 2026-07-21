import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RestaurantResolutionSchema } from "@foodseyo/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  addLocalPhoto,
  buildRestaurantSelectionScreen,
  createLocalInputDraft,
  preserveLinkInput,
  type RestaurantSelectionScreenView,
} from "../src/index.js";
import { RestaurantConfirmationPanel } from "../app/restaurant-confirmation/restaurant-confirmation-client.jsx";

interface ConfirmationFixture {
  readonly draft: {
    readonly linkInput: string;
    readonly photos: readonly {
      readonly clientId: string;
      readonly byteCount: number;
    }[];
  };
  readonly resolutions: Readonly<Record<string, unknown>>;
}

const fixture = JSON.parse(
  await readFile(resolve("fixtures/restaurant-confirmation-ui.valid.json"), "utf8"),
) as ConfirmationFixture;

const globalStyles = await readFile(resolve("app/globals.css"), "utf8");

let draft = preserveLinkInput(createLocalInputDraft(), fixture.draft.linkInput);
for (const photo of fixture.draft.photos) {
  draft = addLocalPhoto(draft, photo.clientId, photo.byteCount);
}

const screens = Object.fromEntries(
  Object.entries(fixture.resolutions).map(([state, resolution]) => [
    state,
    buildRestaurantSelectionScreen(
      draft,
      RestaurantResolutionSchema.parse(resolution),
    ),
  ]),
) as Readonly<Record<string, RestaurantSelectionScreenView>>;

const renderPanel = (
  screen: RestaurantSelectionScreenView,
  options: {
    readonly selectedCandidateId?: string | null;
    readonly submissionState?: "idle" | "loading" | "error";
    readonly statusMessage?: string;
  } = {},
) =>
  renderToStaticMarkup(
    createElement(RestaurantConfirmationPanel, {
      screen,
      selectedCandidateId: options.selectedCandidateId ?? null,
      submissionState: options.submissionState ?? "idle",
      statusMessage: options.statusMessage ?? "",
    }),
  );

const candidateScreen = screens.candidate!;
const firstCandidate = candidateScreen.candidates[0]!;
const candidateMarkup = renderPanel(candidateScreen);

assert.equal(candidateScreen.candidates.length, 2);
assert.match(candidateMarkup, /Which restaurant is yours\?/);
assert.match(candidateMarkup, /Harbor Noodle House/);
assert.match(candidateMarkup, /18 Pier Street, Boston, MA/);
assert.match(candidateMarkup, /Matches text in your photo/);
assert.match(candidateMarkup, /aria-pressed="false"/);
assert.match(candidateMarkup, /Yes, this is the restaurant/);
assert.match(candidateMarkup, /disabled=""/);
assert.match(candidateMarkup, /Continue with menu photos only/);
assert.match(candidateMarkup, /Server confirmation is not connected/);

const selectedMarkup = renderPanel(candidateScreen, {
  selectedCandidateId: firstCandidate.candidateId,
});
assert.match(selectedMarkup, /aria-pressed="true"/);
assert.match(selectedMarkup, /Selected/);
const selectedConfirmButton = selectedMarkup.match(
  /<button class="primary-button"[^>]*>Yes, this is the restaurant<\/button>/,
)?.[0];
assert(selectedConfirmButton);
assert.equal(selectedConfirmButton.includes("disabled"), false);

const conflictingMarkup = renderPanel(screens.conflicting!);
assert.match(conflictingMarkup, /Restaurant details conflict/);
assert.match(conflictingMarkup, /different locations/);

const rejectedMarkup = renderPanel(screens.rejected!);
assert.match(rejectedMarkup, /No restaurant candidates matched/);
assert.match(rejectedMarkup, /Try restaurant matching again/);
assert.match(rejectedMarkup, /menu photos only/i);

const loadingMarkup = renderPanel(candidateScreen, {
  selectedCandidateId: firstCandidate.candidateId,
  submissionState: "loading",
});
assert.match(loadingMarkup, /aria-busy="true"/);
assert.match(loadingMarkup, /Saving your fixture choice/);
assert.match(loadingMarkup, /Saving choice/);

const errorMarkup = renderPanel(candidateScreen, {
  selectedCandidateId: firstCandidate.candidateId,
  submissionState: "error",
  statusMessage: "The fixture choice could not be saved. Your selection is still here.",
});
assert.match(errorMarkup, /role="alert"/);
assert.match(errorMarkup, /Your selection is still here/);
assert.match(errorMarkup, /aria-pressed="true"/);

const confirmedMarkup = renderPanel(screens.user_confirmed!, {
  selectedCandidateId: screens.user_confirmed!.candidates[0]!.candidateId,
});
assert.match(confirmedMarkup, /Restaurant confirmed/);
assert.match(confirmedMarkup, /Continue to menu analysis/);

const safeScreens = JSON.stringify(screens);
assert.equal(safeScreens.includes("googlePlaceId"), false);
assert.equal(safeScreens.includes("restaurantId"), false);
assert.equal(safeScreens.includes("confirmationEvidence"), false);
for (const resolution of Object.values(fixture.resolutions)) {
  const parsed = RestaurantResolutionSchema.parse(resolution);
  for (const candidate of parsed.candidates) {
    assert.equal(candidateMarkup.includes(candidate.googlePlaceId), false);
    assert.equal(selectedMarkup.includes(candidate.googlePlaceId), false);
  }
}

assert.match(globalStyles, /min-width:\s*320px/);
assert.match(globalStyles, /width:\s*min\(100% - 2rem, 30rem\)/);
assert.match(globalStyles, /min-height:\s*44px/);
assert.match(globalStyles, /:focus-visible/);

console.log("Foodseyo restaurant confirmation UI fixture validation passed.");
