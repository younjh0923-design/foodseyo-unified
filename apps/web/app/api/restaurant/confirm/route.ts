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

const errorResponse = (code: PublicErrorCode): Response => {
  const definition = PUBLIC_ERROR_REGISTRY[code];
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message: definition.message,
        correlationId: randomUUID(),
        retryable: definition.retryable,
      },
    },
    { status: definition.httpStatus },
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT");
  }
  if (
    !isRecord(body) ||
    Object.keys(body).length !== 2 ||
    typeof body.analysisToken !== "string" ||
    typeof body.selectedCandidateId !== "string" ||
    body.analysisToken.length === 0 ||
    body.analysisToken.length > 200_000 ||
    !UUID_PATTERN.test(body.selectedCandidateId)
  ) {
    return errorResponse("INVALID_INPUT");
  }

  try {
    const service = createLiveRestaurantConfirmationService(process.env);
    const result = await service.confirm({
      analysisToken: body.analysisToken,
      selectedCandidateId: body.selectedCandidateId,
      signal: request.signal,
    });
    if (result.status !== "success") {
      if (result.status === "error") {
        return Response.json(
          { ok: false, error: result.error.error },
          { status: result.error.httpStatus },
        );
      }
      return errorResponse("ANALYSIS_TEMPORARILY_UNAVAILABLE");
    }
    return Response.json({ ok: true, data: result.value });
  } catch {
    return errorResponse("INTERNAL_ERROR");
  }
}
