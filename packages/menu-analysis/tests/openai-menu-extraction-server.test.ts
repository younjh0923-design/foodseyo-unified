import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  MenuSourceInputSchema,
  PortInvocationContextSchema,
} from "@foodseyo/contracts";

import { OpenAIMenuImageExtractionAdapter } from "../src/index.js";

const source = MenuSourceInputSchema.parse({
  contractVersion: CONTRACT_VERSIONS.menuSource,
  source: {
    sourceRef: "11111111-1111-4111-8111-111111111111",
    sourceType: "uploaded_menu",
    sourceFingerprint: "sha256:network-free-openai-adapter-test",
    collectedAt: "2026-07-21T18:00:00.000Z",
  },
  restaurantContext: null,
  menuScope: "default",
  content: {
    kind: "image_collection",
    contentHandle: "handle:network-free-image",
    sensitivity: "sensitive_transient",
    byteCount: 8,
    pageCount: null,
  },
  requestedAt: "2026-07-21T18:00:00.000Z",
});
const context = PortInvocationContextSchema.parse({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "network_free_openai_adapter",
  signal: new AbortController().signal,
  timeoutMs: 10_000,
});

let providerCalls = 0;
let requestBody: Record<string, unknown> | null = null;
const adapter = new OpenAIMenuImageExtractionAdapter(
  "network-free-test-key",
  "model:network-free-test",
  (handle) =>
    handle === source.content.contentHandle
      ? [
          { bytes: new Uint8Array([1, 2, 3, 4]), mediaType: "image/jpeg" },
          { bytes: new Uint8Array([5, 6, 7, 8]), mediaType: "image/png" },
        ]
      : null,
  {
    now: () => "2026-07-21T18:00:01.000Z",
    fetchImplementation: async (_input, init) => {
      providerCalls += 1;
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer network-free-test-key",
      );
      assert.equal(typeof init?.body, "string");
      requestBody = JSON.parse(init?.body as string) as Record<string, unknown>;
      return Response.json({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  analysisQuality: "good",
                  restaurantName: "Test Noodle House",
                  restaurantAddress: "18 Test Street, Boston, MA",
                  restaurantVisualText: "TEST NOODLE HOUSE",
                  menuScope: "dinner",
                  sections: [
                    {
                      name: "Mains",
                      items: [
                        {
                          name: "Test Noodles",
                          description: "Vegetable noodles",
                          price: { amountMinor: 1250, currency: "USD" },
                          optionTexts: ["Add tofu"],
                          sourceIndexes: [0, 1],
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
  },
);

const result = await adapter.extractWithRestaurantClues(source, context);
assert.equal(result.status, "success");
assert.equal(providerCalls, 1);
assert(requestBody);
assert.equal(requestBody.model, "model:network-free-test");
assert.equal(requestBody.store, false);
assert.equal("reasoning" in requestBody, false);
assert.equal(
  JSON.stringify(requestBody).includes("uniqueItems"),
  false,
  "strict Structured Outputs must not contain unsupported uniqueItems",
);
const serializedRequest = JSON.stringify(requestBody);
for (const requiredRestaurantClueInstruction of [
  "headers",
  "logos",
  "top corners",
  "footers",
  "mixed-script text",
  "restaurantVisualText",
  "phone number",
  "official domain",
]) {
  assert.equal(
    serializedRequest.includes(requiredRestaurantClueInstruction),
    true,
    `provider request must prioritize ${requiredRestaurantClueInstruction}`,
  );
}
assert.equal(JSON.stringify(requestBody).includes("data:image/jpeg;base64,AQIDBA=="), true);
assert.equal(JSON.stringify(requestBody).includes("data:image/png;base64,BQYHCA=="), true);
if (result.status !== "success") throw new Error("adapter result was not successful");
assert.equal(result.value.restaurantClues.name, "Test Noodle House");
assert.equal(result.value.extraction.menuScope, "dinner");
assert.equal(result.value.extraction.sections[0]?.items[0]?.name, "Test Noodles");
assert.deepEqual(
  result.value.extraction.sections[0]?.items[0]?.sourceEvidence[0]?.sourceIndexes,
  [0, 1],
);

const providerOutput = (sourceIndexes: readonly number[]) => ({
  output: [
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            analysisQuality: "good",
            restaurantName: null,
            restaurantAddress: null,
            restaurantVisualText: null,
            menuScope: "default",
            sections: [
              {
                name: null,
                items: [
                  {
                    name: "Network-free noodles",
                    description: null,
                    price: null,
                    optionTexts: [],
                    sourceIndexes,
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

// One and five images use the same supported strict schema boundary. The
// existing test above covers the distinct two-image request.
for (const imageCount of [1, 5] as const) {
  let sentImageCount = 0;
  const countAdapter = new OpenAIMenuImageExtractionAdapter(
    "network-free-test-key",
    "model:network-free-test",
    () =>
      Array.from({ length: imageCount }, (_, index) => ({
        bytes: new Uint8Array([index + 1]),
        mediaType: "image/jpeg" as const,
      })),
    {
      now: () => "2026-07-21T18:00:01.000Z",
      fetchImplementation: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          input: Array<{ content: Array<{ type: string }> }>;
        };
        sentImageCount = body.input[0]?.content.filter(
          (part) => part.type === "input_image",
        ).length ?? 0;
        return Response.json(
          providerOutput(Array.from({ length: imageCount }, (_, index) => index)),
        );
      },
    },
  );
  const countResult = await countAdapter.extractWithRestaurantClues(
    source,
    context,
  );
  assert.equal(countResult.status, "success");
  assert.equal(sentImageCount, imageCount);
}

// Provider failures and malformed provider output retain distinct safe stages
// without logging provider responses or image contents.
{
  const failures: unknown[] = [];
  const errorAdapter = new OpenAIMenuImageExtractionAdapter(
    "network-free-test-key",
    "model:network-free-test",
    () => [{ bytes: new Uint8Array([1, 2]), mediaType: "image/png" }],
    {
      now: () => "2026-07-21T18:00:01.000Z",
      fetchImplementation: async () => new Response(null, { status: 400 }),
      observeSafeFailure: (failure) => failures.push(failure),
    },
  );
  const errorResult = await errorAdapter.extractWithRestaurantClues(source, context);
  assert.equal(errorResult.status, "error");
  if (errorResult.status === "error") {
    assert.equal(errorResult.error.error.code, "UPSTREAM_UNAVAILABLE");
  }
  assert.deepEqual(failures, [
    {
      correlationId: context.correlationId,
      failedStage: "openai_request",
      safeErrorCode: "UPSTREAM_UNAVAILABLE",
      imageCount: 1,
      imageByteSizes: [2],
    },
  ]);
}

{
  const failures: unknown[] = [];
  const invalidProviderAdapter = new OpenAIMenuImageExtractionAdapter(
    "network-free-test-key",
    "model:network-free-test",
    () => [{ bytes: new Uint8Array([1]), mediaType: "image/webp" }],
    {
      now: () => "2026-07-21T18:00:01.000Z",
      fetchImplementation: async () => Response.json(providerOutput([0, 0])),
      observeSafeFailure: (failure) => failures.push(failure),
    },
  );
  const invalidProviderResult = await invalidProviderAdapter.extractWithRestaurantClues(
    source,
    context,
  );
  assert.equal(invalidProviderResult.status, "error");
  assert.equal(
    (failures[0] as { failedStage?: string } | undefined)?.failedStage,
    "provider_schema_validation",
  );
}

console.log("Foodseyo OpenAI 이미지 추출 adapter의 network-free 검증을 통과했습니다.");
