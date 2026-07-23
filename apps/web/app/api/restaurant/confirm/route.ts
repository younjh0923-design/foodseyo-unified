import { randomUUID } from "node:crypto";

import {
  PUBLIC_ERROR_REGISTRY,
  type PublicErrorCode,
} from "@foodseyo/contracts";

import { createLiveRestaurantConfirmationService } from "../../../../src/live-restaurant-confirmation-server.js";

export const runtime = "nodejs";
export const maxDuration = 90;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const errorResponse = (
  code: PublicErrorCode,
  correlationId = randomUUID(),
): Response => {
  const definition = PUBLIC_ERROR_REGISTRY[code];
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message: definition.message,
        correlationId,
        retryable: definition.retryable,
      },
    },
    { status: definition.httpStatus },
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = Date.now();
  const correlationId = randomUUID();
  const logSafeFailure = (
    code: PublicErrorCode,
    failedStage: "request_parsing" | "confirmation_validation" | "publication",
  ): void => {
    console.error(JSON.stringify({
      event: "restaurant_confirmation_failed",
      correlation_id: correlationId,
      safe_error_code: code,
      failed_stage: failedStage,
      total_ms: Date.now() - requestStartedAt,
    }));
  };
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logSafeFailure("INVALID_INPUT", "request_parsing");
    return errorResponse("INVALID_INPUT", correlationId);
  }
  if (
    !isRecord(body) ||
    Object.keys(body).length !== 2 ||
    typeof body.analysisToken !== "string" ||
    body.analysisToken.length === 0 ||
    body.analysisToken.length > 200_000 ||
    (body.selectedCandidateId !== null &&
      (typeof body.selectedCandidateId !== "string" ||
        !UUID_PATTERN.test(body.selectedCandidateId)))
  ) {
    logSafeFailure("INVALID_INPUT", "request_parsing");
    return errorResponse("INVALID_INPUT", correlationId);
  }

  try {
    const service = createLiveRestaurantConfirmationService(process.env);
    const result = await service.confirm({
      analysisToken: body.analysisToken,
      selectedCandidateId: body.selectedCandidateId,
      signal: request.signal,
      correlationId,
      observeSafeTiming: (timing) => {
        console.info(JSON.stringify({
          event: "restaurant_confirmation_timing",
          correlation_id: timing.correlationId,
          confirm_cache_lookup_ms: timing.confirmCacheLookupMs,
          publication_ms: timing.publicationMs,
          total_ms: timing.totalMs,
          publication_mode: timing.outcome,
          publication_cache_hit: timing.cacheReuse,
        }));
      },
    });
    if (result.status !== "success") {
      if (result.status === "error") {
        logSafeFailure(
          result.error.error.code,
          result.error.error.code === "INVALID_INPUT"
            ? "confirmation_validation"
            : "publication",
        );
        return Response.json(
          { ok: false, error: result.error.error },
          { status: result.error.httpStatus },
        );
      }
      logSafeFailure("ANALYSIS_TEMPORARILY_UNAVAILABLE", "publication");
      return errorResponse("ANALYSIS_TEMPORARILY_UNAVAILABLE", correlationId);
    }
    return Response.json({ ok: true, data: result.value });
  } catch {
    logSafeFailure("INTERNAL_ERROR", "publication");
    return errorResponse("INTERNAL_ERROR", correlationId);
  }
}
