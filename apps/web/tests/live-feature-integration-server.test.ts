import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  PortInvocationContextSchema,
  RestaurantCandidateSchema,
  RestaurantResolutionSchema,
  type CanonicalMenuAnalysis,
} from "@foodseyo/contracts";

import { buildResultScreen, createLocalInputDraft } from "../src/foundation.js";
import { OfficialMenuAnalysisService } from "../src/official-menu-analysis-server.js";
import { OpenAIMenuGuidanceService } from "../src/openai-menu-guidance-server.js";
import { RestaurantLinkCandidateResolver } from "../src/restaurant-link-server.js";

const context = PortInvocationContextSchema.parse({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "live_feature_network_free",
  signal: new AbortController().signal,
  timeoutMs: 10_000,
});

const candidate = RestaurantCandidateSchema.parse({
  contractVersion: CONTRACT_VERSIONS.restaurantResolution,
  candidateId: "11111111-1111-4111-8111-111111111111",
  googlePlaceId: "fixture_place_branch_a",
  displayName: "Fixture Branch A",
  fullAddress: "1 Fixture Avenue",
  shortAddress: "Fixture Avenue",
  location: null,
  matchSignals: ["user_link"],
  rank: 1,
});

const resolution = RestaurantResolutionSchema.parse({
  contractVersion: CONTRACT_VERSIONS.restaurantResolution,
  state: "user_confirmed",
  candidates: [candidate],
  selectedCandidateId: candidate.candidateId,
  restaurantId: "22222222-2222-4222-8222-222222222222",
  confirmationEvidence: {
    kind: "user_action",
    actionRef: "action:fixture-confirm",
    recordedAt: "2026-07-22T12:00:00.000Z",
  },
  requiresUserConfirmation: false,
  canContinueMenuOnly: true,
  resolvedAt: "2026-07-22T12:00:00.000Z",
});

// Google Maps links use their embedded place query and still return canonical
// Google Places candidates through the existing finder boundary.
{
  let receivedName: string | null = null;
  const resolver = new RestaurantLinkCandidateResolver(
    {},
    async (clues) => {
      receivedName = clues.name;
      return { status: "success", value: [candidate] };
    },
  );
  const result = await resolver.resolve(
    "https://www.google.com/maps/place/Fixture+Branch+A",
    context,
  );
  assert.equal(
    result.status,
    "success",
    result.status === "error"
      ? result.error.error.code
      : result.status === "outcome"
        ? result.outcome.code
        : undefined,
  );
  assert.equal(receivedName, "Fixture Branch A");
}

// Google Maps short links follow only Google-hosted redirects and stop at the
// explicit redirect budget.
{
  let shortFetches = 0;
  let receivedName: string | null = null;
  const resolver = new RestaurantLinkCandidateResolver(
    {},
    async (clues) => {
      receivedName = clues.name;
      return { status: "success", value: [candidate] };
    },
    {
      fetchImplementation: async () => {
        shortFetches += 1;
        return new Response(null, {
          status: 302,
          headers: {
            location: "https://www.google.com/maps/place/Short+Link+Branch",
          },
        });
      },
    },
  );
  const result = await resolver.resolve("https://maps.app.goo.gl/fixture", context);
  assert.equal(result.status, "success");
  assert.equal(shortFetches, 1);
  assert.equal(receivedName, "Short Link Branch");

  let redirectFetches = 0;
  const limitedResolver = new RestaurantLinkCandidateResolver(
    {},
    async () => {
      throw new Error("redirect-limited link must not reach candidate lookup");
    },
    {
      fetchImplementation: async () => {
        redirectFetches += 1;
        return new Response(null, {
          status: 302,
          headers: {
            location: `https://maps.app.goo.gl/redirect-${redirectFetches}`,
          },
        });
      },
    },
  );
  const limited = await limitedResolver.resolve(
    "https://maps.app.goo.gl/redirect-start",
    context,
  );
  assert.equal(limited.status, "outcome");
  assert.equal(redirectFetches, 4);
}

// General restaurant URLs reject local/private destinations before any
// provider call, and use the approved extraction model when a dedicated web
// search model is not configured.
{
  let providerCalls = 0;
  let finderCalls = 0;
  let requestedModel: unknown = null;
  const resolver = new RestaurantLinkCandidateResolver(
    {
      OPENAI_API_KEY: "network-free-key",
      OPENAI_MENU_EXTRACTION_MODEL: "model:fallback-web-search",
    },
    async () => {
      finderCalls += 1;
      return { status: "success", value: [candidate] };
    },
    {
      fetchImplementation: async (_input, init) => {
        providerCalls += 1;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestedModel = body.model;
        return Response.json({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    restaurantName: "Fixture Branch A",
                    restaurantAddress: "1 Fixture Avenue",
                  }),
                },
              ],
            },
          ],
        });
      },
    },
  );
  for (const blocked of [
    "http://localhost/menu",
    "http://127.0.0.1/menu",
    "http://10.0.0.8/menu",
    "http://[::1]/menu",
  ]) {
    const result = await resolver.resolve(blocked, context);
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.error.error.code, "INVALID_INPUT");
    }
  }
  assert.equal(providerCalls, 0);
  assert.equal(finderCalls, 0);

  const general = await resolver.resolve(
    "https://restaurant.example/menu",
    context,
  );
  assert.equal(general.status, "success");
  assert.equal(providerCalls, 1);
  assert.equal(finderCalls, 1);
  assert.equal(requestedModel, "model:fallback-web-search");
}

// A confirmed restaurant collects the official site first, keeps the bytes
// request-scoped, then extracts a canonical compact menu without real network.
{
  let providerCalls = 0;
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://places.googleapis.com/")) {
      return Response.json({ websiteUri: "https://fixture.example/" });
    }
    providerCalls += 1;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (Array.isArray(body.tools)) {
      return Response.json({
        id: "resp_fixture_search",
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                {
                  url: "https://fixture.example/menu",
                  title: "Fixture Branch A menu",
                },
              ],
            },
          },
        ],
      });
    }
    return Response.json({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                analysisQuality: "good",
                menuScope: "dinner",
                sections: [
                  {
                    name: "Mains",
                    items: [
                      {
                        name: "Fixture Noodles",
                        description: "Noodles with scallions",
                        price: { amountMinor: 1400, currency: "USD" },
                        optionTexts: ["Add tofu"],
                      },
                    ],
                  },
                ],
              }),
            },
          ],
        },
      ],
    });
  };
  const html = new TextEncoder().encode(
    "<html><body><h1>Menu</h1><p>Fixture Noodles $14</p></body></html>",
  );
  const service = new OfficialMenuAnalysisService(
    {
      OPENAI_API_KEY: "network-free-key",
      OPENAI_MENU_EXTRACTION_MODEL: "model:menu",
      OPENAI_WEB_SEARCH_MODEL: "model:web",
      GOOGLE_PLACES_API_KEY: "network-free-places-key",
    },
    {
      fetchImplementation,
      now: () => "2026-07-22T12:00:01.000Z",
      dnsResolver: { resolve: async () => ["93.184.216.34"] },
      transport: {
        request: async () => ({
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: (async function* () {
            yield html;
          })(),
          cancel: async () => undefined,
        }),
      },
    },
  );
  const result = await service.extract(
    "https://fixture.example/menu",
    resolution,
    context,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("official extraction expected");
  assert.equal(result.value.extraction.sections[0]?.items[0]?.name, "Fixture Noodles");
  assert.equal(result.value.extraction.source.sourceType, "official_website");
  assert.equal(result.value.byteCount, html.byteLength);
  assert.equal(providerCalls, 2);
}

// An unreachable official website does not end acquisition; the bounded web
// search candidate is collected and extracted next.
{
  let discoveryCalls = 0;
  let extractionCalls = 0;
  let officialRequests = 0;
  let fallbackRequests = 0;
  const html = new TextEncoder().encode(
    "<html><body><h1>Menu</h1><p>Fallback Rice $12</p></body></html>",
  );
  const service = new OfficialMenuAnalysisService(
    {
      OPENAI_API_KEY: "network-free-key",
      OPENAI_MENU_EXTRACTION_MODEL: "model:menu-and-search",
      GOOGLE_PLACES_API_KEY: "network-free-places-key",
    },
    {
      now: () => "2026-07-22T12:00:02.000Z",
      fetchImplementation: async (input, init) => {
        const url = String(input);
        if (url.startsWith("https://places.googleapis.com/")) {
          return Response.json({ websiteUri: "https://official.example/" });
        }
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        if (Array.isArray(body.tools)) {
          discoveryCalls += 1;
          return Response.json({
            id: "resp_fixture_fallback_search",
            output: [
              {
                type: "web_search_call",
                action: {
                  sources: [
                    {
                      url: "https://fallback.example/menu",
                      title: "Fixture Branch A fallback menu",
                    },
                  ],
                },
              },
            ],
          });
        }
        extractionCalls += 1;
        return Response.json({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    analysisQuality: "good",
                    menuScope: "dinner",
                    sections: [
                      {
                        name: "Mains",
                        items: [
                          {
                            name: "Fallback Rice",
                            description: "Rice with vegetables",
                            price: { amountMinor: 1200, currency: "USD" },
                            optionTexts: [],
                          },
                        ],
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        });
      },
      dnsResolver: { resolve: async () => ["93.184.216.34"] },
      transport: {
        request: async (input) => {
          if (input.url.startsWith("https://official.example/")) {
            officialRequests += 1;
            return {
              status: 404,
              headers: { "content-type": "text/html" },
              body: (async function* () {})(),
              cancel: async () => undefined,
            };
          }
          fallbackRequests += 1;
          return {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
            body: (async function* () {
              yield html;
            })(),
            cancel: async () => undefined,
          };
        },
      },
    },
  );
  const result = await service.extract(
    "https://fallback.example/menu",
    resolution,
    context,
  );
  assert.equal(
    result.status,
    "success",
    result.status === "error"
      ? `${result.error.error.code}; discovery=${discoveryCalls}; extraction=${extractionCalls}; official=${officialRequests}; fallback=${fallbackRequests}`
      : result.status === "outcome"
        ? `${result.outcome.code}; discovery=${discoveryCalls}; extraction=${extractionCalls}; official=${officialRequests}; fallback=${fallbackRequests}`
        : undefined,
  );
  if (result.status !== "success") throw new Error("fallback extraction expected");
  assert.equal(result.value.extraction.sections[0]?.items[0]?.name, "Fallback Rice");
  assert.equal(result.value.extraction.source.sourceType, "web_search_discovery");
  assert.equal(discoveryCalls, 1);
  assert.equal(extractionCalls, 1);
  assert.equal(officialRequests, 1);
  assert.equal(fallbackRequests, 1);
}

// Dish guidance and the ordering assistant are constrained to the validated
// result passed to the provider and are both exercised without network.
{
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/menu-analysis/fixtures/u2.1-pipeline.valid.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { canonicalAnalysis: CanonicalMenuAnalysis };
  const analysis = fixture.canonicalAnalysis;
  const guidanceItem = analysis.menuItems.find(
    (item) =>
      !analysis.effectiveProfiles.some(
        (profile) => profile.menuItemId === item.menuItemId,
      ),
  );
  const menuItemId = guidanceItem?.menuItemId;
  if (!menuItemId) throw new Error("fixture menu item expected");
  let callCount = 0;
  const guidanceService = new OpenAIMenuGuidanceService(
    {
      OPENAI_API_KEY: "network-free-key",
      OPENAI_MENU_EXTRACTION_MODEL: "model:menu",
      OPENAI_EXPLANATION_MODEL: "model:assistant",
    },
    {
      fetchImplementation: async () => {
        callCount += 1;
        return Response.json({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text:
                    callCount === 1
                      ? JSON.stringify({
                          items: [
                            {
                              menuItemId,
                              basicTastes: ["umami"],
                              flavorNotes: ["garlicky"],
                              textures: ["chewy"],
                              heat: "mild",
                              richness: "moderate",
                              heatAdjustability: null,
                              ingredients: [
                                { name: "noodles", basis: "source_stated" },
                              ],
                              orderTip: "Choose this for a savory, chewy dish.",
                            },
                          ],
                        })
                      : callCount === 2
                        ? JSON.stringify({
                          answer: "The noodle bowl is the closest savory option.",
                          suggestedMenuItemIds: [menuItemId],
                        })
                        : JSON.stringify({
                            answer: "This dish is allergen-safe.",
                            suggestedMenuItemIds: [menuItemId],
                          }),
                },
              ],
            },
          ],
        });
      },
    },
  );
  const guidance = await guidanceService.build(analysis, "en", context);
  assert.equal(guidance[0]?.textures[0], "chewy");
  const resultScreen = buildResultScreen(
    createLocalInputDraft(),
    analysis,
    "en",
    guidance,
  );
  assert.equal(
    resultScreen.menuItems.find((item) => item.menuItemId === menuItemId)?.orderTip,
    "Choose this for a savory, chewy dish.",
  );
  const evidenceBases = new Set(
    resultScreen.menuItems.flatMap((item) =>
      item.facts.map((fact) => fact.evidence.basis),
    ),
  );
  assert(evidenceBases.has("source_stated"));
  assert(evidenceBases.has("inferred_from_source"));
  const boundaryFixture = JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/contracts/fixtures/boundary-dtos.valid.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { canonicalMenuAnalysis: CanonicalMenuAnalysis };
  const baselineResult = buildResultScreen(
    createLocalInputDraft(),
    boundaryFixture.canonicalMenuAnalysis,
    "en",
  );
  assert(
    baselineResult.menuItems.some((item) =>
      item.facts.some((fact) => fact.evidence.basis === "culinary_baseline"),
    ),
  );
  const answer = await guidanceService.answer(
    resultScreen,
    "What should I order?",
    "en",
    context,
  );
  assert.equal(answer.status, "success");
  if (answer.status === "success") {
    assert.deepEqual(answer.value.suggestedMenuItemIds, [menuItemId]);
  }
  const allergyAnswer = await guidanceService.answer(
    resultScreen,
    "Is this safe for a peanut allergy?",
    "en",
    context,
  );
  assert.equal(allergyAnswer.status, "success");
  if (allergyAnswer.status === "success") {
    assert.doesNotMatch(allergyAnswer.value.answer, /allergen-safe/iu);
    assert.match(
      allergyAnswer.value.answer,
      /can't confirm allergen or dietary safety/iu,
    );
    assert.deepEqual(allergyAnswer.value.suggestedMenuItemIds, []);
  }
}

console.log("Foodseyo link, official-menu, dish-guidance, and assistant checks passed.");
