import {
  CONTRACT_VERSIONS,
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  RestaurantResolutionRequestSchema,
  RestaurantResolutionSchema,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type RestaurantCandidate,
  type RestaurantResolution,
  type RestaurantResolutionRequest,
} from "@foodseyo/contracts";

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

export const validateRestaurantCandidateSelection = (
  request: RestaurantResolutionRequest,
  context: PortInvocationContext,
): PortResult<RestaurantCandidate> => {
  PortInvocationContextSchema.parse(context);
  const parsedRequest = RestaurantResolutionRequestSchema.safeParse(request);
  if (!parsedRequest.success) {
    return { status: "error", error: publicError("INVALID_INPUT", context) };
  }

  const value = parsedRequest.data;
  if (
    value.candidates.length === 0 ||
    value.selectedCandidateId === null ||
    value.confirmationEvidence === null
  ) {
    return { status: "error", error: publicError("INVALID_INPUT", context) };
  }

  const candidateIds = new Set(
    value.candidates.map((candidate) => candidate.candidateId),
  );
  if (candidateIds.size !== value.candidates.length) {
    return { status: "error", error: publicError("INVALID_INPUT", context) };
  }

  const selectedCandidates = value.candidates.filter(
    (candidate) => candidate.candidateId === value.selectedCandidateId,
  );
  if (selectedCandidates.length !== 1) {
    return { status: "error", error: publicError("INVALID_INPUT", context) };
  }
  const selectedCandidate = selectedCandidates[0];
  if (selectedCandidate === undefined) {
    return { status: "error", error: publicError("INVALID_INPUT", context) };
  }

  return { status: "success", value: selectedCandidate };
};

export const createConfirmedRestaurantResolution = (
  request: RestaurantResolutionRequest,
  restaurantId: string | null,
  context: PortInvocationContext,
): PortResult<RestaurantResolution> => {
  const selection = validateRestaurantCandidateSelection(request, context);
  if (selection.status !== "success") {
    return selection;
  }

  const confirmationEvidence = request.confirmationEvidence;
  if (confirmationEvidence === null) {
    return { status: "error", error: publicError("INVALID_INPUT", context) };
  }

  const candidates = [...request.candidates].sort(
    (left, right) => left.rank - right.rank,
  );
  const parsedResolution = RestaurantResolutionSchema.safeParse({
    contractVersion: CONTRACT_VERSIONS.restaurantResolution,
    state:
      confirmationEvidence.kind === "user_action"
        ? "user_confirmed"
        : "externally_verified",
    candidates,
    selectedCandidateId: selection.value.candidateId,
    restaurantId,
    confirmationEvidence,
    requiresUserConfirmation: false,
    canContinueMenuOnly: true,
    resolvedAt: confirmationEvidence.recordedAt,
  });

  return parsedResolution.success
    ? { status: "success", value: parsedResolution.data }
    : {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
};
