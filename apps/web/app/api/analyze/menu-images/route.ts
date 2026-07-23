import { randomUUID } from "node:crypto";

import {
  PUBLIC_ERROR_REGISTRY,
  type PublicErrorCode,
} from "@foodseyo/contracts";

import {
  LIVE_MENU_MEDIA_TYPES,
  createLiveRestaurantConfirmationService,
  type SafeMenuAnalysisFailure,
} from "../../../../src/live-restaurant-confirmation-server.js";

export const runtime = "nodejs";
export const maxDuration = 90;

const errorResponse = (
  code: PublicErrorCode,
  correlationId = randomUUID(),
  status?: number,
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
    { status: status ?? definition.httpStatus },
  );
};

export async function POST(request: Request): Promise<Response> {
  const correlationId = randomUUID();
  let failureLogged = false;
  const observeSafeFailure = (failure: SafeMenuAnalysisFailure): void => {
    if (failureLogged) return;
    failureLogged = true;
    console.error(JSON.stringify({
      event: "menu_image_analysis_failed",
      correlationId: failure.correlationId,
      failedStage: failure.failedStage,
      safeErrorCode: failure.safeErrorCode,
      imageCount: failure.imageCount,
      imageByteSizes: failure.imageByteSizes,
    }));
  };
  const fail = (
    failedStage: SafeMenuAnalysisFailure["failedStage"],
    safeErrorCode: PublicErrorCode,
    images: readonly File[] = [],
  ): Response => {
    observeSafeFailure({
      correlationId,
      failedStage,
      safeErrorCode,
      imageCount: images.length,
      imageByteSizes: images.map((image) => image.size),
    });
    return errorResponse(safeErrorCode, correlationId);
  };
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("request_parsing", "INVALID_INPUT");
  }
  const keys = [...form.keys()];
  const uploadedFiles = form
    .getAll("image")
    .filter((image): image is File => image instanceof File);
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
    return fail("request_parsing", "INVALID_INPUT", uploadedFiles);
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
    return fail("image_decoding_size_validation", "INVALID_INPUT", uploadedFiles);
  }

  let transientImages: Array<{
    readonly bytes: Uint8Array;
    readonly mediaType: (typeof LIVE_MENU_MEDIA_TYPES)[number];
  }>;
  try {
    transientImages = await Promise.all(
      (images as File[]).map(async (image) => ({
        bytes: new Uint8Array(await image.arrayBuffer()),
        mediaType: image.type as (typeof LIVE_MENU_MEDIA_TYPES)[number],
      })),
    );
  } catch {
    return fail(
      "image_decoding_size_validation",
      "INVALID_INPUT",
      uploadedFiles,
    );
  }

  try {
    const service = createLiveRestaurantConfirmationService(process.env);
    const result = await service.analyze({
      images: transientImages,
      restaurantName:
        typeof restaurantNameValue === "string" ? restaurantNameValue : null,
      language: languageValue === "en" ? "en" : "ko",
      signal: request.signal,
      correlationId,
      observeSafeFailure,
    });
    if (result.status !== "success") {
      if (result.status === "error") {
        return Response.json(
          { ok: false, error: result.error.error },
          { status: result.error.httpStatus },
        );
      }
      return fail(
        "google_places_resolution",
        "ANALYSIS_TEMPORARILY_UNAVAILABLE",
        uploadedFiles,
      );
    }
    return Response.json({ ok: true, data: result.value });
  } catch {
    return fail("openai_request", "INTERNAL_ERROR", uploadedFiles);
  }
}
