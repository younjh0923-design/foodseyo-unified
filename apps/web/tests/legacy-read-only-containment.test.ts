import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { POST as postMenuImages } from "../app/api/analyze/menu-images/route.js";
import { POST as postRestaurantLink } from "../app/api/analyze/restaurant-link/route.js";
import { POST as postAssistant } from "../app/api/assistant/route.js";
import {
  LEGACY_READ_ONLY_CODE,
  LEGACY_READ_ONLY_MESSAGE,
} from "../app/api/legacy-read-only.js";
import { POST as postRestaurantConfirm } from "../app/api/restaurant/confirm/route.js";
import {
  LEGACY_READ_ONLY,
  LanguageSelector,
} from "../app/language-selector.jsx";

type RouteHandler = (request: Request) => Response | Promise<Response>;

const routes: ReadonlyArray<{
  readonly path: string;
  readonly sourcePath: string;
  readonly handler: RouteHandler;
}> = [
  {
    path: "/api/analyze/menu-images",
    sourcePath: "app/api/analyze/menu-images/route.ts",
    handler: postMenuImages,
  },
  {
    path: "/api/analyze/restaurant-link",
    sourcePath: "app/api/analyze/restaurant-link/route.ts",
    handler: postRestaurantLink,
  },
  {
    path: "/api/assistant",
    sourcePath: "app/api/assistant/route.ts",
    handler: postAssistant,
  },
  {
    path: "/api/restaurant/confirm",
    sourcePath: "app/api/restaurant/confirm/route.ts",
    handler: postRestaurantConfirm,
  },
];

let requestPropertyReadCount = 0;
let networkFetchCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  networkFetchCount += 1;
  throw new Error("Network access is forbidden in the containment test.");
}) as typeof fetch;

try {
  for (const route of routes) {
    const inaccessibleRequest = new Proxy({} as Request, {
      get() {
        requestPropertyReadCount += 1;
        throw new Error(`${route.path} accessed the request before returning 410.`);
      },
    });
    const response = await route.handler(inaccessibleRequest);
    assert.equal(response.status, 410, `${route.path} must return 410 Gone`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: LEGACY_READ_ONLY_CODE,
        message: LEGACY_READ_ONLY_MESSAGE,
        retryable: false,
      },
    });
  }

  assert.equal(requestPropertyReadCount, 0);
  assert.equal(networkFetchCount, 0);

  assert.equal(LEGACY_READ_ONLY, true);
  const englishLanding = renderToStaticMarkup(
    createElement(LanguageSelector, { initialLanguage: "en" }),
  );
  const koreanLanding = renderToStaticMarkup(
    createElement(LanguageSelector, { initialLanguage: "ko" }),
  );
  assert.match(
    englishLanding,
    /Foodseyo v1 is preserved as a legacy demo\./u,
  );
  assert.match(
    englishLanding,
    /Live menu analysis is no longer available\./u,
  );
  assert.match(
    koreanLanding,
    /Foodseyo v1은 레거시 데모로 보존되어 있습니다\./u,
  );
  assert.match(englishLanding, /<input[^>]*type="url"[^>]*disabled=""/u);
  assert.match(
    englishLanding,
    /<button[^>]*class="upload-entry-card"[^>]*disabled=""/u,
  );
  assert.match(englishLanding, /<input[^>]*type="file"[^>]*disabled=""/u);
  assert.equal(networkFetchCount, 0);
} finally {
  globalThis.fetch = originalFetch;
}

const routeSources = await Promise.all(
  routes.map(async (route) => ({
    path: route.path,
    source: await readFile(resolve(route.sourcePath), "utf8"),
  })),
);
const responderSource = await readFile(
  resolve("app/api/legacy-read-only.ts"),
  "utf8",
);
const routeExecutionSource = [
  ...routeSources.map(({ source }) => source),
  responderSource,
].join("\n");

for (const route of routeSources) {
  assert.match(route.source, /legacyReadOnlyResponse/u);
  assert.doesNotMatch(
    route.source,
    /live-restaurant-confirmation-server|@foodseyo\/(?:database|menu-analysis|restaurant-resolution|source-acquisition)/u,
    `${route.path} must not import a provider, service, or database module`,
  );
}
assert.doesNotMatch(responderSource, /^import\s/mu);

const countMatches = (pattern: RegExp): number =>
  routeExecutionSource.match(pattern)?.length ?? 0;
const invocationCounts = {
  providerAdapter: countMatches(
    /createLiveRestaurantConfirmationService|openai|googlePlaces|\.analyze(?:Link)?\(|\.assist\(|\.confirm\(/giu,
  ),
  serviceFactory: countMatches(
    /createLiveRestaurantConfirmationService|process\.env/gu,
  ),
  databaseRepositoryQueryWrite: countMatches(
    /@foodseyo\/database|DATABASE_URL|repository|pool|\.query\(|\.insert\(|\.update\(|\.delete\(/giu,
  ),
  publicationSupersession: countMatches(
    /publication|supersession|supersed/giu,
  ),
};
assert.deepEqual(invocationCounts, {
  providerAdapter: 0,
  serviceFactory: 0,
  databaseRepositoryQueryWrite: 0,
  publicationSupersession: 0,
});

const pageSource = await readFile(resolve("app/page.jsx"), "utf8");
const languageSelectorSource = await readFile(
  resolve("app/language-selector.jsx"),
  "utf8",
);
const handoffSource = await readFile(resolve("app/analysis-handoff.js"), "utf8");
const homepageExecutionSource = [pageSource, languageSelectorSource, handoffSource].join(
  "\n",
);
assert.doesNotMatch(
  homepageExecutionSource,
  /live-restaurant-confirmation-server|@foodseyo\/(?:database|menu-analysis|restaurant-resolution|source-acquisition)|DATABASE_URL|process\.env/gu,
);
assert.equal(
  languageSelectorSource.match(/if \(LEGACY_READ_ONLY\) return;/gu)?.length,
  3,
);

console.log(
  `Foodseyo legacy containment passed: routes=4, status=410, provider=${invocationCounts.providerAdapter}, serviceFactory=${invocationCounts.serviceFactory}, database=${invocationCounts.databaseRepositoryQueryWrite}, publication=${invocationCounts.publicationSupersession}, network=${networkFetchCount}.`,
);
