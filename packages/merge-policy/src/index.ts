import {
  CONTRACT_VERSIONS,
  EffectiveDishProfileSchema,
  EffectiveProfileMergeRequestSchema,
  EffectiveProfileMergeResultSchema,
  PortInvocationContextSchema,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  isTimeoutAbortSignal,
  parseDeterministicFakePlan,
  selectDeterministicFakeResult,
  type CulinaryClaimValue,
  type DeterministicFakePlan,
  type DishClaim,
  type EffectiveDishProfile,
  type EffectiveField,
  type EffectiveProfileMergePort,
  type EffectiveProfileMergeRequest,
  type EffectiveProfileMergeResult,
  type EvidenceBasis,
  type MenuItemClaim,
  type PortInvocationContext,
  type PortResult,
  type ProvenanceReference,
  type PublicErrorCode,
  type PublicErrorEnvelope,
} from "@foodseyo/contracts";

const FIELD_NAMES = [
  "basicTastes",
  "flavorNotes",
  "textures",
  "heat",
  "richness",
  "heatAdjustability",
  "ingredients",
] as const;

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

const contractValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => contractValuesEqual(item, right[index]))
    );
  }
  if (
    typeof left === "object" ||
    typeof right === "object" ||
    left === null ||
    right === null
  ) {
    if (
      typeof left !== "object" ||
      typeof right !== "object" ||
      left === null ||
      right === null
    ) {
      return false;
    }
    const leftRecord = left as Readonly<Record<string, unknown>>;
    const rightRecord = right as Readonly<Record<string, unknown>>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      contractValuesEqual(leftKeys, rightKeys) &&
      leftKeys.every((key) =>
        contractValuesEqual(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
};

const fieldName = (
  claim: CulinaryClaimValue,
): (typeof FIELD_NAMES)[number] => {
  switch (claim.kind) {
    case "basic_tastes":
      return "basicTastes";
    case "flavor_notes":
      return "flavorNotes";
    case "textures":
      return "textures";
    case "heat":
      return "heat";
    case "richness":
      return "richness";
    case "heat_adjustability":
      return "heatAdjustability";
    case "ingredient":
      return "ingredients";
  }
};

const appendUnique = <T>(values: T[], candidate: T) => {
  if (!values.some((value) => contractValuesEqual(value, candidate))) {
    values.push(candidate);
  }
};

const selectedValue = (
  selectedClaims: readonly (MenuItemClaim | DishClaim)[],
): unknown => {
  const firstClaim = selectedClaims[0];
  if (firstClaim === undefined) {
    return undefined;
  }
  if (
    firstClaim.claim.kind === "basic_tastes" ||
    firstClaim.claim.kind === "flavor_notes" ||
    firstClaim.claim.kind === "textures"
  ) {
    const values: string[] = [];
    selectedClaims.forEach((claim) => {
      if (
        claim.claim.kind === firstClaim.claim.kind &&
        "values" in claim.claim
      ) {
        claim.claim.values.forEach((value) => appendUnique(values, value));
      }
    });
    return values;
  }
  if (firstClaim.claim.kind === "ingredient") {
    const ingredients: {
      ingredientRef: string | null;
      ingredientName: string;
      role: (typeof firstClaim.claim)["role"];
    }[] = [];
    selectedClaims.forEach((claim) => {
      if (claim.claim.kind === "ingredient") {
        appendUnique(ingredients, {
          ingredientRef: claim.claim.ingredientRef,
          ingredientName: claim.claim.ingredientName,
          role: claim.claim.role,
        });
      }
    });
    return ingredients;
  }
  return firstClaim.claim.value;
};

const selectedProvenance = (
  selectedClaims: readonly (MenuItemClaim | DishClaim)[],
): ProvenanceReference[] => {
  const provenance: ProvenanceReference[] = [];
  selectedClaims.forEach((claim) => {
    claim.provenance.forEach((entry) => appendUnique(provenance, entry));
  });
  return provenance;
};

const unknownField = (): EffectiveField<never> => ({
  state: "unknown",
  basis: "unknown",
  claimIds: [],
  provenance: [],
});

const deriveField = (
  field: (typeof FIELD_NAMES)[number],
  menuClaims: readonly MenuItemClaim[],
  dishClaims: readonly DishClaim[],
): EffectiveField<unknown> | null => {
  const matchingMenuClaims = menuClaims.filter(
    (claim) => fieldName(claim.claim) === field,
  );
  const sourceStated = matchingMenuClaims.filter(
    (claim) => claim.basis === "source_stated",
  );
  const inferred = matchingMenuClaims.filter(
    (claim) => claim.basis === "inferred_from_source",
  );
  const matchingDishClaims = dishClaims.filter(
    (claim) => fieldName(claim.claim) === field,
  );
  const selected =
    sourceStated.length > 0
      ? sourceStated
      : inferred.length > 0
        ? inferred
        : matchingDishClaims;
  if (selected.length === 0) {
    return unknownField();
  }

  const basis: Exclude<EvidenceBasis, "unknown"> =
    sourceStated.length > 0
      ? "source_stated"
      : inferred.length > 0
        ? "inferred_from_source"
        : "culinary_baseline";
  const value = selectedValue(selected);
  if (
    field !== "basicTastes" &&
    field !== "flavorNotes" &&
    field !== "textures" &&
    field !== "ingredients" &&
    selected.some(
      (claim) => !contractValuesEqual(selectedValue([claim]), value),
    )
  ) {
    return null;
  }
  return {
    state: "known",
    value,
    basis,
    claimIds: selected.map((claim) => claim.claimId),
    provenance: selectedProvenance(selected),
  };
};

export class FakeEffectiveProfileMergePort
  implements EffectiveProfileMergePort
{
  #callCount = 0;
  private readonly plan: DeterministicFakePlan<EffectiveProfileMergeResult>;

  constructor(
    plan: DeterministicFakePlan<EffectiveProfileMergeResult>,
  ) {
    this.plan = parseDeterministicFakePlan(
      plan,
      EffectiveProfileMergeResultSchema,
    );
  }

  get callCount(): number {
    return this.#callCount;
  }

  merge(
    request: EffectiveProfileMergeRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<EffectiveProfileMergeResult>> {
    this.#callCount += 1;
    EffectiveProfileMergeRequestSchema.parse(request);
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}

export class DeterministicEffectiveProfileMergeService
  implements EffectiveProfileMergePort
{
  #callCount = 0;

  constructor(private readonly derivedAt: string) {}

  get callCount(): number {
    return this.#callCount;
  }

  merge(
    request: EffectiveProfileMergeRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<EffectiveProfileMergeResult>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    if (context.signal.aborted) {
      return Promise.resolve({
        status: "error",
        error: publicError(
          isTimeoutAbortSignal(context.signal)
            ? "UPSTREAM_TIMEOUT"
            : "ANALYSIS_TEMPORARILY_UNAVAILABLE",
          context,
        ),
      });
    }
    const requestResult = EffectiveProfileMergeRequestSchema.safeParse(request);
    if (!requestResult.success) {
      return Promise.resolve({
        status: "error",
        error: publicError("INVALID_INPUT", context),
      });
    }

    const matched = requestResult.data.matches.filter(
      (match) => match.state === "matched" && match.dishId !== null,
    );
    const duplicateMatch =
      new Set(matched.map((match) => match.matchId)).size !== matched.length ||
      new Set(
        matched.map((match) => `${match.menuItemId}:${String(match.dishId)}`),
      ).size !== matched.length;
    if (duplicateMatch) {
      return Promise.resolve({
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      });
    }

    const profiles: EffectiveDishProfile[] = [];
    for (const match of matched) {
      if (match.dishId === null) {
        continue;
      }
      const menuClaims = requestResult.data.menuItemClaims.filter(
        (claim) => claim.menuItemId === match.menuItemId,
      );
      const dishClaims = requestResult.data.dishClaims.filter(
        (claim) =>
          claim.dishId === match.dishId && claim.reviewState === "reviewed",
      );
      const fields = {
        basicTastes: deriveField("basicTastes", menuClaims, dishClaims),
        flavorNotes: deriveField("flavorNotes", menuClaims, dishClaims),
        textures: deriveField("textures", menuClaims, dishClaims),
        heat: deriveField("heat", menuClaims, dishClaims),
        richness: deriveField("richness", menuClaims, dishClaims),
        heatAdjustability: deriveField(
          "heatAdjustability",
          menuClaims,
          dishClaims,
        ),
        ingredients: deriveField("ingredients", menuClaims, dishClaims),
      };
      if (Object.values(fields).some((field) => field === null)) {
        return Promise.resolve({
          status: "error",
          error: publicError("INVALID_UPSTREAM_RESULT", context),
        });
      }
      const completeFields = fields as EffectiveDishProfile["fields"];
      const profile = EffectiveDishProfileSchema.safeParse({
        contractVersion: CONTRACT_VERSIONS.boundaryDtos,
        kind: "derived",
        menuItemId: match.menuItemId,
        dishId: match.dishId,
        matchId: match.matchId,
        mergePolicyVersion: CONTRACT_VERSIONS.mergePolicy,
        dishKnowledgeVersion: CONTRACT_VERSIONS.dishKnowledge,
        inputClaimIds: FIELD_NAMES.flatMap((field) => {
          const value = completeFields[field];
          return value.state === "known" ? value.claimIds : [];
        }),
        fields: completeFields,
        derivedAt: this.derivedAt,
      });
      if (!profile.success) {
        return Promise.resolve({
          status: "error",
          error: publicError("INVALID_UPSTREAM_RESULT", context),
        });
      }
      profiles.push(profile.data);
    }

    const result = EffectiveProfileMergeResultSchema.safeParse({ profiles });
    return Promise.resolve(
      result.success
        ? { status: "success", value: result.data }
        : {
            status: "error",
            error: publicError("INTERNAL_ERROR", context),
          },
    );
  }
}
