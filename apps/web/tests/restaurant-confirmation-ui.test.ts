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

assert.deepEqual(Object.keys(screens).sort(), [
  "candidate",
  "conflicting",
  "externally_verified",
  "rejected",
  "user_confirmed",
]);

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
assert(candidateScreen.candidates.every((candidate) => !candidate.isSelected));
assert.match(candidateMarkup, /어느 식당인가요/);
assert.match(candidateMarkup, /사용자가 선택하기 전에는 지점이 확정되지 않습니다/);
assert.match(candidateMarkup, /하버 누들 하우스/);
assert.match(candidateMarkup, /사진 속 글자 단서/);
assert.match(candidateMarkup, /aria-pressed="false"/);
assert.match(candidateMarkup, /네, 이 식당이에요/);
assert.match(candidateMarkup, /disabled=""/);
assert.match(candidateMarkup, /메뉴 사진만으로 계속/);
assert.match(candidateMarkup, /서버 확인이 연결되지 않습니다/);
assert.doesNotMatch(candidateMarkup, /Option|1위|가장 가까운|높은 점수|확정 식당/);

const selectedMarkup = renderPanel(candidateScreen, {
  selectedCandidateId: firstCandidate.candidateId,
});
assert.match(selectedMarkup, /aria-pressed="true"/);
assert.match(selectedMarkup, /선택됨/);
const selectedConfirmButton = selectedMarkup.match(
  /<button class="primary-button"[^>]*>네, 이 식당이에요<\/button>/,
)?.[0];
assert(selectedConfirmButton);
assert.equal(selectedConfirmButton.includes("disabled"), false);

const conflictingMarkup = renderPanel(screens.conflicting!);
assert.match(conflictingMarkup, /식당 단서가 서로 달라요/);
assert.match(conflictingMarkup, /서로 다른 지점/);
assert.match(conflictingMarkup, /메뉴 사진만으로 계속/);

const rejectedMarkup = renderPanel(screens.rejected!);
assert.match(rejectedMarkup, /일치하는 식당 후보를 찾지 못했어요/);
assert.match(rejectedMarkup, /식당 다시 찾기/);
assert.match(rejectedMarkup, /메뉴 사진만으로 계속/);

const loadingMarkup = renderPanel(candidateScreen, {
  selectedCandidateId: firstCandidate.candidateId,
  submissionState: "loading",
});
assert.match(loadingMarkup, /aria-busy="true"/);
assert.match(loadingMarkup, /Fixture 선택을 저장하는 중/);
assert.match(loadingMarkup, /선택 저장 중/);

const errorMarkup = renderPanel(candidateScreen, {
  selectedCandidateId: firstCandidate.candidateId,
  submissionState: "error",
  statusMessage: "Fixture 선택을 저장하지 못했어요. 선택 내용은 그대로 남아 있어요.",
});
assert.match(errorMarkup, /role="alert"/);
assert.match(errorMarkup, /선택 내용은 그대로 남아 있어요/);
assert.match(errorMarkup, /aria-pressed="true"/);

const userConfirmedScreen = screens.user_confirmed!;
const userConfirmedMarkup = renderPanel(userConfirmedScreen, {
  selectedCandidateId: userConfirmedScreen.candidates[0]!.candidateId,
});
assert.match(userConfirmedMarkup, /사용자가 이 지점을 선택했어요/);
assert.match(userConfirmedMarkup, /사용자 선택<\/span>/);
assert.match(userConfirmedMarkup, /메뉴 분석 계속/);
assert.doesNotMatch(userConfirmedMarkup, /외부.*검증/);
assert.doesNotMatch(userConfirmedMarkup, /aria-pressed/);

const externallyVerifiedScreen = screens.externally_verified!;
const externallyVerifiedMarkup = renderPanel(externallyVerifiedScreen, {
  selectedCandidateId: externallyVerifiedScreen.candidates[0]!.candidateId,
});
assert.match(externallyVerifiedMarkup, /외부 확인 정보로 이 지점이 확인됐어요/);
assert.match(externallyVerifiedMarkup, /외부 확인<\/span>/);
assert.match(externallyVerifiedMarkup, /메뉴 분석 계속/);
assert.doesNotMatch(externallyVerifiedMarkup, /사용자가 이 지점을 선택했어요/);
assert.doesNotMatch(externallyVerifiedMarkup, /선택됨/);
assert.doesNotMatch(externallyVerifiedMarkup, /aria-pressed/);

const safeScreens = JSON.stringify(screens);
for (const forbiddenKey of [
  "googlePlaceId",
  "restaurantId",
  "confirmationEvidence",
  "rank",
  "location",
]) {
  assert.equal(safeScreens.includes(`"${forbiddenKey}"`), false);
}
for (const resolution of Object.values(fixture.resolutions)) {
  const parsed = RestaurantResolutionSchema.parse(resolution);
  for (const candidate of parsed.candidates) {
    for (const markup of [
      candidateMarkup,
      selectedMarkup,
      conflictingMarkup,
      userConfirmedMarkup,
      externallyVerifiedMarkup,
    ]) {
      assert.equal(markup.includes(candidate.googlePlaceId), false);
    }
  }
}

assert.match(candidateMarkup, /하버 누들 하우스 케임브리지 리버사이드 패밀리 다이닝룸/);
assert.match(globalStyles, /min-width:\s*320px/);
assert.match(globalStyles, /width:\s*min\(100% - 2rem, 30rem\)/);
assert.match(globalStyles, /min-height:\s*44px/);
assert.match(globalStyles, /:focus-visible/);
assert.match(globalStyles, /overflow-wrap:\s*anywhere/);
assert.match(globalStyles, /flex-wrap:\s*wrap/);

console.log("Foodseyo 식당 후보 확인 UI 설계·QA fixture 검증을 통과했습니다.");
