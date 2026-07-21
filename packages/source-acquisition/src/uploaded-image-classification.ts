export const UPLOADED_IMAGE_CROP_COMPLETENESS = [
  "complete",
  "sufficient",
  "partial",
  "unknown",
] as const;

export type UploadedImageCropCompleteness =
  (typeof UPLOADED_IMAGE_CROP_COMPLETENESS)[number];

export interface UploadedImageObservation {
  readonly imageReadable: boolean;
  readonly menuTextDetected: boolean;
  readonly dishNamesDetected: boolean;
  readonly pricesDetected: boolean;
  readonly multipleMenuSectionsDetected: boolean;
  readonly fullMenuScopeDetected: boolean;
  readonly storefrontSignDetected: boolean;
  readonly restaurantNameDetected: boolean;
  readonly cropCompleteness: UploadedImageCropCompleteness;
  readonly confidence: number;
}

export type UploadedImageReuseClassification =
  | "menu_full"
  | "menu_partial"
  | "storefront"
  | "unknown";

export interface UploadedImageReuseOutcome {
  readonly kind: UploadedImageReuseClassification;
}

export const MIN_UPLOADED_IMAGE_CLASSIFICATION_CONFIDENCE = 0.6;

export const classifyUploadedImageReuse = (
  observation: UploadedImageObservation,
): UploadedImageReuseOutcome => {
  const confidenceIsUsable =
    Number.isFinite(observation.confidence) &&
    observation.confidence >= MIN_UPLOADED_IMAGE_CLASSIFICATION_CONFIDENCE &&
    observation.confidence <= 1;
  if (!observation.imageReadable || !confidenceIsUsable) {
    return { kind: "unknown" };
  }

  const menuEvidence =
    observation.menuTextDetected ||
    observation.dishNamesDetected ||
    observation.pricesDetected;
  const completeCrop =
    observation.cropCompleteness === "complete" ||
    observation.cropCompleteness === "sufficient";
  const fullMenuEvidence =
    observation.menuTextDetected &&
    (observation.dishNamesDetected || observation.pricesDetected) &&
    (observation.multipleMenuSectionsDetected ||
      observation.fullMenuScopeDetected) &&
    completeCrop;

  // Explicit menu evidence takes precedence over concurrent storefront signs.
  if (menuEvidence) {
    return { kind: fullMenuEvidence ? "menu_full" : "menu_partial" };
  }

  const contradictoryMenuScope =
    observation.multipleMenuSectionsDetected ||
    observation.fullMenuScopeDetected;
  const storefrontEvidence =
    observation.storefrontSignDetected || observation.restaurantNameDetected;
  if (storefrontEvidence && !contradictoryMenuScope) {
    return { kind: "storefront" };
  }

  return { kind: "unknown" };
};

export type UploadedImageReference = TransientMenuContent & {
  readonly kind: "image_collection";
};

export interface UploadedImageClassifier {
  observe(
    reference: UploadedImageReference,
    context: PortInvocationContext,
  ): Promise<PortResult<UploadedImageObservation>>;
}

const publicError = (
  code: PublicErrorCode,
  context: PortInvocationContext,
): PublicErrorEnvelope => {
  const definition = PUBLIC_ERROR_REGISTRY[code];
  return PublicErrorEnvelopeSchema.parse({
    error: {
      code,
      message: definition.message,
      correlationId: context.correlationId,
      retryable: definition.retryable,
    },
    httpStatus: definition.httpStatus,
  });
};

const cloneObservation = (
  observation: UploadedImageObservation,
): UploadedImageObservation => ({ ...observation });

const validObservation = (value: unknown): value is UploadedImageObservation => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const observation = value as Record<string, unknown>;
  const booleanFields = [
    "imageReadable",
    "menuTextDetected",
    "dishNamesDetected",
    "pricesDetected",
    "multipleMenuSectionsDetected",
    "fullMenuScopeDetected",
    "storefrontSignDetected",
    "restaurantNameDetected",
  ] as const;
  return (
    Object.keys(observation).length === booleanFields.length + 2 &&
    booleanFields.every((field) => typeof observation[field] === "boolean") &&
    typeof observation.cropCompleteness === "string" &&
    UPLOADED_IMAGE_CROP_COMPLETENESS.includes(
      observation.cropCompleteness as UploadedImageCropCompleteness,
    ) &&
    typeof observation.confidence === "number" &&
    Number.isFinite(observation.confidence) &&
    observation.confidence >= 0 &&
    observation.confidence <= 1
  );
};

const cloneReference = (
  reference: UploadedImageReference,
): UploadedImageReference => ({ ...reference });

/** Deterministic classifier fake; it never exposes configured observations. */
export class FakeUploadedImageClassifier implements UploadedImageClassifier {
  #callCount = 0;
  #lastReference: UploadedImageReference | null = null;
  readonly #result: PortResult<UploadedImageObservation>;

  constructor(result: PortResult<UploadedImageObservation>) {
    this.#result =
      result.status === "success"
        ? { status: "success", value: cloneObservation(result.value) }
        : result;
  }

  get callCount(): number {
    return this.#callCount;
  }

  get lastReference(): UploadedImageReference | null {
    return this.#lastReference === null
      ? null
      : cloneReference(this.#lastReference);
  }

  observe(
    reference: UploadedImageReference,
    context: PortInvocationContext,
  ): Promise<PortResult<UploadedImageObservation>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    this.#lastReference = cloneReference(reference);
    return Promise.resolve(
      this.#result.status === "success"
        ? { status: "success", value: cloneObservation(this.#result.value) }
        : this.#result,
    );
  }
}

export class UploadedImageReuseService {
  constructor(private readonly classifier: UploadedImageClassifier) {}

  async classify(
    reference: UploadedImageReference,
    context: PortInvocationContext,
  ): Promise<PortResult<UploadedImageReuseOutcome>> {
    PortInvocationContextSchema.parse(context);
    const parsedReference = TransientMenuContentSchema.safeParse(reference);
    if (!parsedReference.success || parsedReference.data.kind !== "image_collection") {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }

    let classifierResult: PortResult<UploadedImageObservation>;
    try {
      classifierResult = await this.classifier.observe(
        { ...parsedReference.data, kind: "image_collection" },
        context,
      );
    } catch {
      return {
        status: "error",
        error: publicError("UPSTREAM_UNAVAILABLE", context),
      };
    }
    if (classifierResult.status !== "success") {
      return classifierResult;
    }
    if (!validObservation(classifierResult.value)) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    return {
      status: "success",
      value: classifyUploadedImageReuse(
        cloneObservation(classifierResult.value),
      ),
    };
  }
}
import {
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  TransientMenuContentSchema,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type TransientMenuContent,
} from "@foodseyo/contracts";
