import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CompactMenuExtractionSchema,
  MODULE_INTERFACE_VERSION,
  MenuSourceInputSchema,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  type CompactMenuExtraction,
  type CompactMenuExtractionPort,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
} from "@foodseyo/contracts";

import { CompactMenuExtractionService } from "../src/index.js";

const fixtureUrl = new URL(
  "../fixtures/u2.1-pipeline.valid.json",
  import.meta.url,
);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as {
  readonly menuSource: unknown;
  readonly extraction: unknown;
};
const input = MenuSourceInputSchema.parse(fixture.menuSource);
const extraction = CompactMenuExtractionSchema.parse(fixture.extraction);

const controller = new AbortController();
const context: PortInvocationContext = {
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "s1-4-minimal-validation",
  timeoutMs: 1_000,
  signal: controller.signal,
};

class RecordingExtractionPort implements CompactMenuExtractionPort {
  callCount = 0;
  lastInput: MenuSourceInput | null = null;
  lastContext: PortInvocationContext | null = null;

  constructor(
    private readonly result: PortResult<CompactMenuExtraction>,
  ) {}

  extract(
    receivedInput: MenuSourceInput,
    receivedContext: PortInvocationContext,
  ): Promise<PortResult<CompactMenuExtraction>> {
    this.callCount += 1;
    this.lastInput = receivedInput;
    this.lastContext = receivedContext;
    return Promise.resolve(this.result);
  }
}

const successResult: PortResult<CompactMenuExtraction> = {
  status: "success",
  value: extraction,
};
const successPort = new RecordingExtractionPort(successResult);
const successService = new CompactMenuExtractionService(successPort);
const returnedSuccess = await successService.extract(input, context);

assert.equal(successPort.callCount, 1);
assert.strictEqual(successPort.lastInput, input);
assert.strictEqual(successPort.lastContext, context);
assert.strictEqual(successPort.lastContext?.signal, controller.signal);
assert.strictEqual(returnedSuccess, successResult);
assert.strictEqual(
  returnedSuccess.status === "success" ? returnedSuccess.value : null,
  extraction,
);

const errorDefinition = PUBLIC_ERROR_REGISTRY.INVALID_UPSTREAM_RESULT;
const errorResult: PortResult<CompactMenuExtraction> = {
  status: "error",
  error: PublicErrorEnvelopeSchema.parse({
    error: {
      code: "INVALID_UPSTREAM_RESULT",
      message: errorDefinition.message,
      correlationId: context.correlationId,
      retryable: errorDefinition.retryable,
    },
    httpStatus: errorDefinition.httpStatus,
  }),
};
const errorPort = new RecordingExtractionPort(errorResult);
const returnedError = await new CompactMenuExtractionService(errorPort).extract(
  input,
  context,
);

assert.equal(errorPort.callCount, 1);
assert.strictEqual(returnedError, errorResult);

console.log("compact menu extraction service validation passed");
