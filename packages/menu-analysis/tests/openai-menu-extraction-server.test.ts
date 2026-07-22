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
    byteCount: 4,
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
      ? { bytes: new Uint8Array([1, 2, 3, 4]), mediaType: "image/jpeg" }
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
                          sourceIndexes: [0],
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
assert.equal(JSON.stringify(requestBody).includes("data:image/jpeg;base64,AQIDBA=="), true);
if (result.status !== "success") throw new Error("adapter result was not successful");
assert.equal(result.value.restaurantClues.name, "Test Noodle House");
assert.equal(result.value.extraction.menuScope, "dinner");
assert.equal(result.value.extraction.sections[0]?.items[0]?.name, "Test Noodles");
assert.deepEqual(
  result.value.extraction.sections[0]?.items[0]?.sourceEvidence[0]?.sourceIndexes,
  [0],
);

console.log("Foodseyo OpenAI 이미지 추출 adapter의 network-free 검증을 통과했습니다.");
