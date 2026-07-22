import { randomUUID } from "node:crypto";

import {
  PUBLIC_ERROR_REGISTRY,
  type PublicErrorCode,
} from "@foodseyo/contracts";

import {
  LIVE_MENU_MEDIA_TYPES,
  createLiveRestaurantConfirmationService,
} from "../../../../src/live-restaurant-confirmation-server.js";

export const runtime = "nodejs";
export const maxDuration = 90;

const errorResponse = (code: PublicErrorCode, status?: number): Response => {
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
    { status: status ?? definition.httpStatus },
  );
};

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("INVALID_INPUT");
  }
  const keys = [...form.keys()];
  if (
    keys.some(
      (key) =>
        key !== "image" && key !== "restaurantName" && key !== "language",
    ) ||
    keys.filter((key) => key === "image").length < 1 ||
    keys.filter((key) => key === "image").length > 5 ||
    keys.filter((key) => key === "restaurantName").length > 1 ||
    keys.filter((key) => key === "language").length > 1
  ) {
    return errorResponse("INVALID_INPUT");
  }
  const images = form.getAll("image");
  const restaurantNameValue = form.get("restaurantName");
  const languageValue = form.get("language");
  if (
    !images.every(
      (image) =>
        image instanceof File &&
        LIVE_MENU_MEDIA_TYPES.includes(
          image.type as (typeof LIVE_MENU_MEDIA_TYPES)[number],
        ),
    ) ||
    (restaurantNameValue !== null && typeof restaurantNameValue !== "string") ||
    (languageValue !== null && languageValue !== "en" && languageValue !== "ko")
  ) {
    return errorResponse("INVALID_INPUT");
  }

  try {
    const service = createLiveRestaurantConfirmationService(process.env);
    const transientImages = await Promise.all(
      (images as File[]).map(async (image) => ({
        bytes: new Uint8Array(await image.arrayBuffer()),
        mediaType: image.type as (typeof LIVE_MENU_MEDIA_TYPES)[number],
      })),
    );
    const result = await service.analyze({
      images: transientImages,
      restaurantName:
        typeof restaurantNameValue === "string" ? restaurantNameValue : null,
      language: languageValue === "en" ? "en" : "ko",
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
