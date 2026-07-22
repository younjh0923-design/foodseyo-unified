import { randomUUID } from "node:crypto";

import {
  PUBLIC_ERROR_REGISTRY,
  type PublicErrorCode,
} from "@foodseyo/contracts";

import { createLiveRestaurantConfirmationService } from "../../../src/live-restaurant-confirmation-server.js";

export const runtime = "nodejs";
export const maxDuration = 90;

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
    typeof body.assistantToken !== "string" ||
    body.assistantToken.length === 0 ||
    body.assistantToken.length > 500_000 ||
    typeof body.question !== "string" ||
    body.question.length === 0 ||
    body.question.length > 500
  ) {
    return errorResponse("INVALID_INPUT");
  }
  try {
    const service = createLiveRestaurantConfirmationService(process.env);
    const result = await service.assist({
      assistantToken: body.assistantToken,
      question: body.question,
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
