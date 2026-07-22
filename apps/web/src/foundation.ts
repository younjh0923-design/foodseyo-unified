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
  type RestaurantMatchSignal,
  type RestaurantResolution,
} from "@foodseyo/contracts";

export type UiLanguage = "en" | "ko";

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
  readonly matchReasons: readonly string[];
  readonly isSelected: boolean;
  readonly canSelect: boolean;
  readonly confirmLabel: string | null;
  readonly confirmAriaLabel: string | null;
}

export interface RestaurantSelectionScreenView {
  readonly kind: "restaurant_confirmation";
  readonly resolutionState: RestaurantResolution["state"];
  readonly title: string;
  readonly description: string;
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

export interface SourceBoundMenuGuidance {
  readonly menuItemId: string;
  readonly basicTastes: readonly string[];
  readonly flavorNotes: readonly string[];
  readonly textures: readonly string[];
  readonly heat: string | null;
  readonly richness: string | null;
  readonly heatAdjustability: string | null;
  readonly ingredients: readonly {
    readonly name: string;
    readonly basis: "source_stated" | "inferred_from_source";
  }[];
  readonly orderTip: string | null;
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
  readonly orderTip: string | null;
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

export const BLOCKED_UI_BINDINGS = Object.freeze({});

const SAFETY_NOTICE: Readonly<Record<UiLanguage, string>> = {
  en: "Ingredient and sensory information does not confirm allergen or dietary safety. Ask the restaurant when safety matters.",
  ko: "재료와 맛 정보만으로 알레르기 또는 식이 안전을 확인할 수 없습니다. 안전이 중요하다면 식당에 직접 문의하세요.",
};

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

const RESTAURANT_RESOLUTION_COPY = {
  en: {
    candidate: {
      title: "Which restaurant is this?",
      description: "These are possible matches. Select the correct location before anything is saved.",
    },
    conflicting: {
      title: "The restaurant clues conflict",
      description: "The available clues point to different locations. Select the correct one to continue.",
    },
    user_confirmed: {
      title: "Selected restaurant",
      description: "You selected this location. Menu analysis can continue.",
    },
    externally_verified: {
      title: "Confirmed restaurant",
      description: "External information confirmed this location. Menu analysis can continue.",
    },
    rejected: {
      title: "We could not identify the restaurant",
      description: "Try again with the restaurant name or a clearer menu photo.",
    },
  },
  ko: {
    candidate: {
      title: "어느 식당인가요?",
      description: "가능한 식당 후보예요. 후보 정보만으로 지점이 확정되지 않으니 직접 선택해 주세요.",
    },
    conflicting: {
      title: "식당 단서가 서로 달라요",
      description: "확인된 단서가 서로 다른 지점을 가리켜요. 올바른 지점을 선택해 주세요.",
    },
    user_confirmed: {
      title: "선택한 식당",
      description: "사용자가 이 지점을 선택했어요. 메뉴 분석을 계속할 수 있어요.",
    },
    externally_verified: {
      title: "확인된 식당",
      description: "외부 확인 정보로 이 지점이 확인됐어요. 메뉴 분석을 계속할 수 있어요.",
    },
    rejected: {
      title: "식당을 확인하지 못했어요",
      description: "식당을 확인하지 못했지만 메뉴 사진만으로 계속할 수 있어요.",
    },
  },
} as const satisfies Readonly<
  Record<
    UiLanguage,
    Readonly<
      Record<
        RestaurantResolution["state"],
        { readonly title: string; readonly description: string }
      >
    >
  >
>;

const RESTAURANT_MATCH_SIGNAL_COPY = {
  en: {
    name: "Restaurant name",
    address: "Address",
    location: "Location",
    user_link: "Submitted link",
    visual_text: "Text visible in the photo",
  },
  ko: {
    name: "식당 이름 단서",
    address: "주소 단서",
    location: "위치 단서",
    user_link: "입력한 링크 단서",
    visual_text: "사진 속 글자 단서",
  },
} as const satisfies Readonly<
  Record<UiLanguage, Readonly<Record<RestaurantMatchSignal, string>>>
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
  language: UiLanguage = "ko",
): RestaurantSelectionScreenView => {
  const parsed = RestaurantResolutionSchema.parse(resolution);
  const copy = RESTAURANT_RESOLUTION_COPY[language][parsed.state];
  const canSelectCandidate =
    parsed.state === "candidate" || parsed.state === "conflicting";
  const controls: AccessibleControl[] = [];

  if (parsed.state === "rejected") {
    controls.push({
      id: "retry-restaurant-matching",
      label: language === "ko" ? "식당 다시 찾기" : "Find the restaurant again",
      ariaLabel: language === "ko" ? "식당 후보를 다시 찾아보기" : "Search for restaurant matches again",
      keyboardAction: "activate",
    });
  }

  if (parsed.state === "user_confirmed" || parsed.state === "externally_verified") {
    controls.push({
      id: "continue-analysis",
      label: language === "ko" ? "메뉴 분석 계속" : "Continue menu analysis",
      ariaLabel: language === "ko" ? "확인된 식당으로 메뉴 분석 계속하기" : "Continue menu analysis with the confirmed restaurant",
      keyboardAction: "activate",
    });
  } else {
    controls.push({
      id: "continue-menu-only",
      label: language === "ko" ? "메뉴 사진만으로 계속" : "Continue with the menu photo",
      ariaLabel: language === "ko" ? "식당을 확정하지 않고 메뉴 사진만으로 계속하기" : "Continue without confirming a restaurant",
      keyboardAction: "activate",
    });
  }

  return {
    kind: "restaurant_confirmation",
    resolutionState: parsed.state,
    title: copy.title,
    description: copy.description,
    draft: cloneDraft(draft),
    requiresUserConfirmation: parsed.requiresUserConfirmation,
    canContinueMenuOnly: parsed.canContinueMenuOnly,
    candidates: parsed.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      name: candidate.displayName,
      address:
        candidate.fullAddress ?? candidate.shortAddress ??
        (language === "ko" ? "주소 정보 미확인" : "Address not confirmed"),
      matchReasons: candidate.matchSignals.map(
        (signal) => RESTAURANT_MATCH_SIGNAL_COPY[language][signal],
      ),
      isSelected: candidate.candidateId === parsed.selectedCandidateId,
      canSelect: canSelectCandidate,
      confirmLabel: canSelectCandidate
        ? language === "ko" ? "이 식당 선택" : "Select this restaurant"
        : null,
      confirmAriaLabel: canSelectCandidate
        ? `${candidate.displayName}, ${
            candidate.fullAddress ??
            candidate.shortAddress ??
            "표시된 주소"
          } ${language === "ko" ? "선택" : "select"}`
        : null,
    })),
    controls,
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

const DEFAULT_CURRENCY_FRACTION_DIGITS = 2;

const currencyFractionDigits = (currency: string): number => {
  try {
    const options = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions();
    const digits = options.maximumFractionDigits;
    if (
      typeof digits === "number" &&
      options.minimumFractionDigits === digits &&
      Number.isInteger(digits) &&
      digits >= 0 &&
      digits <= 20
    ) {
      return digits;
    }
  } catch {
    // An unknown or malformed currency must not make the result screen fail.
  }
  return DEFAULT_CURRENCY_FRACTION_DIGITS;
};

export const formatMenuItemPrice = (
  item: MenuItem,
  language: UiLanguage = "en",
): string => {
  if (item.price === null) {
    return language === "ko" ? "가격 미확인" : "Price not confirmed";
  }
  const { amountMinor, currency } = item.price;
  const fractionDigits = currencyFractionDigits(currency);
  const minorAmount = BigInt(amountMinor);
  const divisor = 10n ** BigInt(fractionDigits);
  const absoluteMinorAmount = minorAmount < 0n ? -minorAmount : minorAmount;
  const wholeAmount = absoluteMinorAmount / divisor;
  const fraction = (absoluteMinorAmount % divisor)
    .toString()
    .padStart(fractionDigits, "0");

  try {
    const formatter = new Intl.NumberFormat(language === "ko" ? "ko-KR" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    const signedWholeAmount: bigint | number =
      minorAmount < 0n
        ? wholeAmount === 0n
          ? -0
          : -wholeAmount
        : wholeAmount;
    return formatter
      .formatToParts(signedWholeAmount)
      .map((part) =>
        part.type === "fraction" && fractionDigits > 0 ? fraction : part.value,
      )
      .join("");
  } catch {
    const sign = minorAmount < 0n ? "-" : "";
    const decimal = fractionDigits > 0 ? `.${fraction}` : "";
    return `${currency} ${sign}${wholeAmount}${decimal}`;
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

const projectGuidanceFacts = (
  guidance: SourceBoundMenuGuidance,
  language: UiLanguage,
): readonly DishFactView[] => {
  const labels =
    language === "ko"
      ? {
          basic_tastes: "기본 맛",
          flavor_notes: "풍미",
          textures: "식감",
          heat: "매운 정도",
          richness: "묵직함",
          heat_adjustability: "맵기 조절",
          ingredients: "재료",
        }
      : {
          basic_tastes: "Basic tastes",
          flavor_notes: "Flavor notes",
          textures: "Texture",
          heat: "Heat",
          richness: "Richness",
          heat_adjustability: "Heat options",
          ingredients: "Ingredients",
        };
  const unknown = language === "ko" ? "확인되지 않음" : "Not confirmed";
  const fact = (
    key: DishFactView["key"],
    values: readonly string[] | string | null,
    basis: "source_stated" | "inferred_from_source" = "inferred_from_source",
  ): DishFactView => {
    const value =
      Array.isArray(values)
        ? values.length > 0
          ? values.map(humanize).join(", ")
          : null
        : values === null
          ? null
          : humanize(values as string);
    return value === null
      ? {
          key,
          label: labels[key],
          value: unknown,
          state: "unknown",
          evidence: EVIDENCE_PRESENTATION.unknown,
        }
      : {
          key,
          label: labels[key],
          value,
          state: "known",
          evidence: EVIDENCE_PRESENTATION[basis],
        };
  };
  const ingredientBasis = guidance.ingredients.every(
    (ingredient) => ingredient.basis === "source_stated",
  )
    ? "source_stated"
    : "inferred_from_source";
  return [
    fact("basic_tastes", guidance.basicTastes),
    fact("flavor_notes", guidance.flavorNotes),
    fact("textures", guidance.textures),
    fact("heat", guidance.heat),
    fact("richness", guidance.richness),
    fact("heat_adjustability", guidance.heatAdjustability),
    fact(
      "ingredients",
      guidance.ingredients.map((ingredient) => ingredient.name),
      ingredientBasis,
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
  language: UiLanguage = "en",
  guidance: readonly SourceBoundMenuGuidance[] = [],
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
      const sourceGuidance =
        guidance.find((candidate) => candidate.menuItemId === item.menuItemId) ??
        null;
      return {
        menuItemId: item.menuItemId,
        name: item.name,
        description:
          item.description ??
          (language === "ko" ? "설명 미확인" : "Description not confirmed"),
        price: formatMenuItemPrice(item, language),
        sectionIndex: item.sectionIndex,
        itemIndex: item.itemIndex,
        dishResolved: profile !== null || sourceGuidance !== null,
        dishStatusMessage:
          profile !== null || sourceGuidance !== null
            ? language === "ko" ? "음식 상세 정보가 있어요" : "Dish details available"
            : unresolved
              ? language === "ko" ? "음식 일치는 확인되지 않았지만 메뉴 항목은 볼 수 있어요." : "Dish match unresolved; the menu item remains available."
              : language === "ko" ? "음식 상세 정보가 확인되지 않았어요." : "Dish details are not confirmed.",
        facts:
          profile !== null
            ? projectProfileFacts(profile)
            : sourceGuidance !== null
              ? projectGuidanceFacts(sourceGuidance, language)
              : projectProfileFacts(null),
        orderTip: sourceGuidance?.orderTip ?? null,
        safetyNotice: SAFETY_NOTICE[language],
        openDetailLabel: language === "ko" ? "상세 보기" : "View details",
        openDetailAriaLabel:
          language === "ko" ? `${item.name} 상세 보기` : `View details for ${item.name}`,
      };
    });

  return {
    kind: "overview",
    draft: cloneDraft(draft),
    title:
      restaurant === null
        ? language === "ko" ? "메뉴 개요" : "Menu overview"
        : language === "ko" ? `${restaurant.displayName} 메뉴` : `${restaurant.displayName} menu`,
    restaurantName: restaurant?.displayName ?? null,
    restaurantAddress:
      restaurant?.fullAddress ?? restaurant?.shortAddress ?? null,
    isMenuOnlyAnalysis: parsed.publicationState === "analysis_only",
    menuItems,
    safetyNotice: SAFETY_NOTICE[language],
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
