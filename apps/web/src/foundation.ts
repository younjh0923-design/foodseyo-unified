import {
  AnalysisApplicationResultSchema,
  CanonicalMenuAnalysisSchema,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  RestaurantResolutionSchema,
  type AnalysisApplicationResult,
  type AnalysisWorkflowPort,
  type AnalysisWorkflowRequest,
  type CanonicalMenuAnalysis,
  type EffectiveDishProfile,
  type EffectiveField,
  type EvidenceBasis,
  type MenuItem,
  type PortInvocationContext,
  type PublicErrorEnvelope,
  type PublicOutcome,
  type RestaurantResolution,
} from "@foodseyo/contracts";

/**
 * These are app-private presentation models. They never cross a package,
 * provider, persistence, or cache boundary and are not shared contract DTOs.
 */
export interface LocalPhotoDraft {
  readonly clientId: string;
  readonly displayLabel: string;
  readonly byteCount: number | null;
}

export interface LocalInputDraft {
  readonly linkInput: string;
  readonly photos: readonly LocalPhotoDraft[];
}

export interface AccessibleControl {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly keyboardAction: "activate" | "type";
}

export interface InputScreenView {
  readonly kind: "input";
  readonly title: "What should I order?";
  readonly description: string;
  readonly draft: LocalInputDraft;
  readonly controls: readonly AccessibleControl[];
}

export interface UploadReviewScreenView {
  readonly kind: "upload_review";
  readonly title: "Review photos";
  readonly draft: LocalInputDraft;
  readonly photoCountLabel: string;
  readonly photos: readonly LocalPhotoDraft[];
  readonly controls: readonly AccessibleControl[];
}

export interface RestaurantCandidateRowView {
  readonly candidateId: string;
  readonly name: string;
  readonly address: string;
  readonly rank: number;
  readonly isSelected: boolean;
  readonly confirmLabel: string;
  readonly confirmAriaLabel: string;
}

export interface RestaurantSelectionScreenView {
  readonly kind: "restaurant_confirmation";
  readonly title: "Choose the restaurant";
  readonly draft: LocalInputDraft;
  readonly requiresUserConfirmation: boolean;
  readonly canContinueMenuOnly: true;
  readonly candidates: readonly RestaurantCandidateRowView[];
  readonly controls: readonly AccessibleControl[];
}

export interface OutcomeScreenView {
  readonly kind: "outcome";
  readonly draft: LocalInputDraft;
  readonly code: PublicOutcome["code"];
  readonly title: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly canContinueMenuOnly: boolean;
  readonly isApplicationFailure: false;
  readonly controls: readonly AccessibleControl[];
}

export interface ErrorScreenView {
  readonly kind: "error";
  readonly draft: LocalInputDraft;
  readonly code: PublicErrorEnvelope["error"]["code"];
  readonly title: "We could not finish this step";
  readonly message: string;
  readonly correlationId: string;
  readonly retryable: boolean;
  readonly controls: readonly AccessibleControl[];
}

export interface EvidencePresentation {
  readonly basis: EvidenceBasis;
  readonly label: string;
  readonly description: string;
}

export interface DishFactView {
  readonly key:
    | "basic_tastes"
    | "flavor_notes"
    | "textures"
    | "heat"
    | "richness"
    | "heat_adjustability"
    | "ingredients";
  readonly label: string;
  readonly value: string;
  readonly state: "known" | "unknown";
  readonly evidence: EvidencePresentation;
}

export interface MenuItemResultView {
  readonly menuItemId: string;
  readonly name: string;
  readonly description: string;
  readonly price: string;
  readonly sectionIndex: number;
  readonly itemIndex: number;
  readonly dishResolved: boolean;
  readonly dishStatusMessage: string;
  readonly facts: readonly DishFactView[];
  readonly safetyNotice: string;
  readonly openDetailLabel: string;
  readonly openDetailAriaLabel: string;
}

export interface ResultScreenView {
  readonly kind: "overview";
  readonly draft: LocalInputDraft;
  readonly title: string;
  readonly restaurantName: string | null;
  readonly restaurantAddress: string | null;
  readonly isMenuOnlyAnalysis: boolean;
  readonly menuItems: readonly MenuItemResultView[];
  readonly safetyNotice: string;
  readonly controls: readonly AccessibleControl[];
}

export type ExperienceScreenView =
  | InputScreenView
  | UploadReviewScreenView
  | RestaurantSelectionScreenView
  | OutcomeScreenView
  | ErrorScreenView
  | ResultScreenView;

export const MOBILE_ACCESSIBILITY_REQUIREMENTS = Object.freeze({
  minimumViewportWidthPx: 320,
  maximumContentWidthRem: 30,
  minimumInteractiveTargetPx: 44,
  horizontalOverflowAllowed: false,
  visibleFocusRequired: true,
  nativeKeyboardActivationRequired: true,
  statusAnnouncementsUseLiveRegions: true,
  imageInputsRequireTextLabels: true,
});

export const BLOCKED_UI_BINDINGS = Object.freeze({
  framework: {
    issue: 20,
    capability: "browser shell and rendered components",
  },
  intakeAndProgress: {
    issue: 21,
    capability:
      "server-bound photo/link intake plus official-source and Web Search progress events",
  },
});

const SAFETY_NOTICE =
  "Ingredient and sensory information does not confirm allergen or dietary safety. Ask the restaurant when safety matters.";

const EVIDENCE_PRESENTATION = {
  source_stated: {
    basis: "source_stated",
    label: "Menu says",
    description: "Directly stated by the current menu source.",
  },
  inferred_from_source: {
    basis: "inferred_from_source",
    label: "Inferred from menu",
    description: "Derived only from current menu evidence; not directly stated.",
  },
  culinary_baseline: {
    basis: "culinary_baseline",
    label: "General dish guidance",
    description:
      "Reviewed general guidance; it is not confirmed for this restaurant's preparation.",
  },
  unknown: {
    basis: "unknown",
    label: "Not confirmed",
    description:
      "No verified value is available. This does not mean absent, false, or safe.",
  },
} as const satisfies Readonly<Record<EvidenceBasis, EvidencePresentation>>;

const OUTCOME_COPY = {
  RESTAURANT_CONFIRMATION_REQUIRED: {
    title: "Confirm the restaurant",
    message: "Choose the correct restaurant before menu analysis continues.",
  },
  RESTAURANT_NOT_RESOLVED: {
    title: "Restaurant not confirmed",
    message: "You can still continue with menu-only analysis.",
  },
  MENU_SOURCE_NOT_FOUND: {
    title: "No menu source found",
    message: "Try another photo or link. No menu information was invented.",
  },
  MENU_SOURCE_CONFLICT: {
    title: "Menu sources do not agree",
    message: "Review the source choice before analysis continues.",
  },
  MENU_PARTIAL: {
    title: "Only part of the menu was available",
    message: "Available items can be reviewed while missing details stay unknown.",
  },
} as const satisfies Readonly<
  Record<PublicOutcome["code"], { readonly title: string; readonly message: string }>
>;

const cloneDraft = (draft: LocalInputDraft): LocalInputDraft => ({
  linkInput: draft.linkInput,
  photos: draft.photos.map((photo) => ({ ...photo })),
});

const requireNonEmpty = (value: string, label: string): string => {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return value;
};

export const createLocalInputDraft = (): LocalInputDraft => ({
  linkInput: "",
  photos: [],
});

export const preserveLinkInput = (
  draft: LocalInputDraft,
  linkInput: string,
): LocalInputDraft => ({
  ...cloneDraft(draft),
  linkInput,
});

export const addLocalPhoto = (
  draft: LocalInputDraft,
  clientId: string,
  byteCount: number | null,
): LocalInputDraft => {
  requireNonEmpty(clientId, "clientId");
  if (byteCount !== null && (!Number.isInteger(byteCount) || byteCount < 0)) {
    throw new Error("byteCount must be a non-negative integer or null");
  }
  if (draft.photos.some((photo) => photo.clientId === clientId)) {
    throw new Error("clientId must be unique within the local draft");
  }
  const nextIndex = draft.photos.length + 1;
  return {
    ...cloneDraft(draft),
    photos: [
      ...draft.photos.map((photo) => ({ ...photo })),
      {
        clientId,
        displayLabel: `Photo ${nextIndex}`,
        byteCount,
      },
    ],
  };
};

export const removeLocalPhoto = (
  draft: LocalInputDraft,
  clientId: string,
): LocalInputDraft => ({
  ...cloneDraft(draft),
  photos: draft.photos
    .filter((photo) => photo.clientId !== clientId)
    .map((photo, index) => ({
      ...photo,
      displayLabel: `Photo ${index + 1}`,
    })),
});

export const buildInputScreen = (draft: LocalInputDraft): InputScreenView => ({
  kind: "input",
  title: "What should I order?",
  description: "Start with a restaurant link or menu photo.",
  draft: cloneDraft(draft),
  controls: [
    {
      id: "restaurant-link",
      label: "Restaurant or menu link",
      ariaLabel: "Enter a restaurant, map, or official menu link",
      keyboardAction: "type",
    },
    {
      id: "choose-photos",
      label: "Choose photos",
      ariaLabel: "Choose menu or restaurant photos",
      keyboardAction: "activate",
    },
    {
      id: "review-input",
      label: "Review input",
      ariaLabel: "Review selected photos and link",
      keyboardAction: "activate",
    },
  ],
});

export const buildUploadReviewScreen = (
  draft: LocalInputDraft,
): UploadReviewScreenView => ({
  kind: "upload_review",
  title: "Review photos",
  draft: cloneDraft(draft),
  photoCountLabel: `${draft.photos.length} ${
    draft.photos.length === 1 ? "photo" : "photos"
  } selected`,
  photos: draft.photos.map((photo) => ({ ...photo })),
  controls: [
    {
      id: "add-photo",
      label: "Add another photo",
      ariaLabel: "Add another menu or restaurant photo",
      keyboardAction: "activate",
    },
    {
      id: "continue-analysis",
      label: "Continue",
      ariaLabel: "Continue with the selected input",
      keyboardAction: "activate",
    },
  ],
});

export const buildRestaurantSelectionScreen = (
  draft: LocalInputDraft,
  resolution: RestaurantResolution,
): RestaurantSelectionScreenView => {
  const parsed = RestaurantResolutionSchema.parse(resolution);
  return {
    kind: "restaurant_confirmation",
    title: "Choose the restaurant",
    draft: cloneDraft(draft),
    requiresUserConfirmation: parsed.requiresUserConfirmation,
    canContinueMenuOnly: parsed.canContinueMenuOnly,
    candidates: parsed.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      name: candidate.displayName,
      address:
        candidate.fullAddress ?? candidate.shortAddress ?? "Address not available",
      rank: candidate.rank,
      isSelected: candidate.candidateId === parsed.selectedCandidateId,
      confirmLabel: "Choose this restaurant",
      confirmAriaLabel: `Choose ${candidate.displayName} at ${
        candidate.fullAddress ?? candidate.shortAddress ?? "the displayed location"
      }`,
    })),
    controls: [
      {
        id: "continue-menu-only",
        label: "Continue with menu only",
        ariaLabel: "Continue without confirming a restaurant",
        keyboardAction: "activate",
      },
    ],
  };
};

export const buildOutcomeScreen = (
  draft: LocalInputDraft,
  outcome: PublicOutcome,
): OutcomeScreenView => {
  const parsed = PublicOutcomeSchema.parse(outcome);
  const copy = OUTCOME_COPY[parsed.code];
  const controls: AccessibleControl[] = [];
  if (parsed.retryable) {
    controls.push({
      id: "retry",
      label: "Try again",
      ariaLabel: `Try ${parsed.stage.replaceAll("_", " ")} again`,
      keyboardAction: "activate",
    });
  }
  if (parsed.canContinueMenuOnly) {
    controls.push({
      id: "continue-menu-only",
      label: "Continue with menu only",
      ariaLabel: "Continue without a confirmed restaurant",
      keyboardAction: "activate",
    });
  }
  return {
    kind: "outcome",
    draft: cloneDraft(draft),
    code: parsed.code,
    title: copy.title,
    message: copy.message,
    retryable: parsed.retryable,
    canContinueMenuOnly: parsed.canContinueMenuOnly,
    isApplicationFailure: false,
    controls,
  };
};

export const buildErrorScreen = (
  draft: LocalInputDraft,
  envelope: PublicErrorEnvelope,
): ErrorScreenView => {
  const parsed = PublicErrorEnvelopeSchema.parse(envelope);
  return {
    kind: "error",
    draft: cloneDraft(draft),
    code: parsed.error.code,
    title: "We could not finish this step",
    message: parsed.error.message,
    correlationId: parsed.error.correlationId,
    retryable: parsed.error.retryable,
    controls: parsed.error.retryable
      ? [
          {
            id: "retry",
            label: "Try again",
            ariaLabel: "Try the failed step again",
            keyboardAction: "activate",
          },
        ]
      : [],
  };
};

const humanize = (value: string): string =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatMoney = (item: MenuItem): string => {
  if (item.price === null) return "Price not confirmed";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: item.price.currency,
    }).format(item.price.amountMinor / 100);
  } catch {
    return `${item.price.currency} ${(item.price.amountMinor / 100).toFixed(2)}`;
  }
};

const projectField = <T>(
  key: DishFactView["key"],
  label: string,
  field: EffectiveField<T>,
  format: (value: T) => string,
): DishFactView => {
  if (field.state === "unknown") {
    return {
      key,
      label,
      value: "Not confirmed",
      state: "unknown",
      evidence: EVIDENCE_PRESENTATION.unknown,
    };
  }
  return {
    key,
    label,
    value: format(field.value),
    state: "known",
    evidence: EVIDENCE_PRESENTATION[field.basis],
  };
};

const projectProfileFacts = (
  profile: EffectiveDishProfile | null,
): readonly DishFactView[] => {
  if (profile === null) {
    const unknownFacts: readonly (readonly [DishFactView["key"], string])[] = [
      ["basic_tastes", "Basic tastes"],
      ["flavor_notes", "Flavor notes"],
      ["textures", "Texture"],
      ["heat", "Heat"],
      ["richness", "Richness"],
      ["heat_adjustability", "Heat options"],
      ["ingredients", "Ingredients"],
    ];
    return unknownFacts.map(([key, label]) => ({
      key,
      label,
      value: "Not confirmed",
      state: "unknown" as const,
      evidence: EVIDENCE_PRESENTATION.unknown,
    }));
  }

  const joinValues = (values: readonly string[]): string =>
    values.length > 0 ? values.map(humanize).join(", ") : "Not confirmed";

  return [
    projectField(
      "basic_tastes",
      "Basic tastes",
      profile.fields.basicTastes,
      joinValues,
    ),
    projectField(
      "flavor_notes",
      "Flavor notes",
      profile.fields.flavorNotes,
      joinValues,
    ),
    projectField("textures", "Texture", profile.fields.textures, joinValues),
    projectField("heat", "Heat", profile.fields.heat, humanize),
    projectField("richness", "Richness", profile.fields.richness, humanize),
    projectField(
      "heat_adjustability",
      "Heat options",
      profile.fields.heatAdjustability,
      humanize,
    ),
    projectField(
      "ingredients",
      "Ingredients",
      profile.fields.ingredients,
      (values) =>
        values
          .map((ingredient) =>
            `${ingredient.ingredientName} (${humanize(ingredient.role)})`,
          )
          .join(", "),
    ),
  ];
};

const selectedRestaurant = (analysis: CanonicalMenuAnalysis) => {
  const selectedId = analysis.restaurantResolution.selectedCandidateId;
  return (
    analysis.restaurantResolution.candidates.find(
      (candidate) => candidate.candidateId === selectedId,
    ) ?? null
  );
};

export const buildResultScreen = (
  draft: LocalInputDraft,
  analysis: CanonicalMenuAnalysis,
): ResultScreenView => {
  const parsed = CanonicalMenuAnalysisSchema.parse(analysis);
  const restaurant = selectedRestaurant(parsed);
  const menuItems = [...parsed.menuItems]
    .sort(
      (left, right) =>
        left.sectionIndex - right.sectionIndex ||
        left.itemIndex - right.itemIndex,
    )
    .map((item): MenuItemResultView => {
      const profile =
        parsed.effectiveProfiles.find(
          (candidate) => candidate.menuItemId === item.menuItemId,
        ) ?? null;
      const unresolved = parsed.dishMatches.some(
        (match) =>
          match.menuItemId === item.menuItemId && match.state === "unresolved",
      );
      return {
        menuItemId: item.menuItemId,
        name: item.name,
        description: item.description ?? "Description not confirmed",
        price: formatMoney(item),
        sectionIndex: item.sectionIndex,
        itemIndex: item.itemIndex,
        dishResolved: profile !== null,
        dishStatusMessage:
          profile !== null
            ? "Dish details available"
            : unresolved
              ? "Dish match unresolved; the menu item remains available."
              : "Dish details are not confirmed.",
        facts: projectProfileFacts(profile),
        safetyNotice: SAFETY_NOTICE,
        openDetailLabel: "View details",
        openDetailAriaLabel: `View details for ${item.name}`,
      };
    });

  return {
    kind: "overview",
    draft: cloneDraft(draft),
    title: restaurant === null ? "Menu overview" : `${restaurant.displayName} menu`,
    restaurantName: restaurant?.displayName ?? null,
    restaurantAddress:
      restaurant?.fullAddress ?? restaurant?.shortAddress ?? null,
    isMenuOnlyAnalysis: parsed.publicationState === "analysis_only",
    menuItems,
    safetyNotice: SAFETY_NOTICE,
    controls: menuItems.map((item) => ({
      id: `detail-${item.menuItemId}`,
      label: item.openDetailLabel,
      ariaLabel: item.openDetailAriaLabel,
      keyboardAction: "activate",
    })),
  };
};

export const buildApplicationResultScreen = (
  draft: LocalInputDraft,
  result: AnalysisApplicationResult,
): ResultScreenView => {
  const parsed = AnalysisApplicationResultSchema.parse(result);
  // Explanation text is deliberately not copied into this foundation model.
  // The canonical structure alone supplies displayed menu meaning until the
  // separately gated S1.6 renderer implementation is available.
  return buildResultScreen(draft, parsed.analysis);
};

export const runDeterministicExperience = async (
  port: AnalysisWorkflowPort,
  request: AnalysisWorkflowRequest,
  context: PortInvocationContext,
  draft: LocalInputDraft,
): Promise<ResultScreenView | OutcomeScreenView | ErrorScreenView> => {
  const result = await port.run(request, context);
  if (result.status === "success") {
    return buildApplicationResultScreen(draft, result.value);
  }
  if (result.status === "outcome") {
    return buildOutcomeScreen(draft, result.outcome);
  }
  return buildErrorScreen(draft, result.error);
};
