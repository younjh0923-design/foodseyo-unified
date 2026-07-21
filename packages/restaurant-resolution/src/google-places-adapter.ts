import { randomUUID } from "node:crypto";

import {
  type PortInvocationContext,
  type PortResult,
  type RestaurantLocaleEvidence,
  type RestaurantMatchSignal,
} from "@foodseyo/contracts";

import {
  type GooglePlacesCandidateAdapter,
  type NormalizedServerRestaurantClues,
} from "./foundation.js";

type FetchImplementation = typeof fetch;

interface GooglePlacesProviderRecord {
  readonly requestCorrelationId: string;
  readonly requestCandidateId: string;
  readonly placeId: string;
  readonly primaryText: string;
  readonly formattedAddress: string | null;
  readonly shortLocation: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly signals: readonly RestaurantMatchSignal[];
  readonly providerRank: number;
  readonly officialWebsiteUrl: string | null;
  readonly localeEvidence: RestaurantLocaleEvidence | null;
}

const GOOGLE_PLACES_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";

const GOOGLE_PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.websiteUri",
  "places.addressComponents",
  "places.priceRange",
].join(",");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const localizedText = (value: unknown): string =>
  isRecord(value) && typeof value.text === "string" ? value.text : "";

const coordinatesFrom = (
  value: unknown,
): { readonly latitude: number | null; readonly longitude: number | null } => {
  if (
    !isRecord(value) ||
    typeof value.latitude !== "number" ||
    !Number.isFinite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    typeof value.longitude !== "number" ||
    !Number.isFinite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180
  ) {
    return { latitude: null, longitude: null };
  }
  return { latitude: value.latitude, longitude: value.longitude };
};

const officialWebsiteFrom = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
      ? value
      : null;
  } catch {
    return null;
  }
};

const countryCodeFrom = (value: unknown): string | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const country = value.find(
    (component) =>
      isRecord(component) &&
      Array.isArray(component.types) &&
      component.types.includes("country"),
  );
  if (!isRecord(country) || typeof country.shortText !== "string") {
    return null;
  }
  const countryCode = country.shortText.toUpperCase();
  return /^[A-Z]{2}$/u.test(countryCode) ? countryCode : null;
};

const moneyCurrencyCode = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.currencyCode !== "string") {
    return null;
  }
  const currencyCode = value.currencyCode.toUpperCase();
  return /^[A-Z]{3}$/u.test(currencyCode) ? currencyCode : null;
};

const currencyCodeFrom = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  return (
    moneyCurrencyCode(value.startPrice) ?? moneyCurrencyCode(value.endPrice)
  );
};

const localeEvidenceFrom = (place: Record<string, unknown>) => {
  const countryCode = countryCodeFrom(place.addressComponents);
  const currencyCode = currencyCodeFrom(place.priceRange);
  return countryCode !== null && currencyCode !== null
    ? {
        countryCode,
        countryBasis: "source_stated",
        currencyCode,
        currencyBasis: "source_stated",
      } satisfies RestaurantLocaleEvidence
    : null;
};

const matchSignalsFrom = (
  clues: NormalizedServerRestaurantClues,
): readonly RestaurantMatchSignal[] => {
  const signals: RestaurantMatchSignal[] = [];
  if (clues.name !== null) signals.push("name");
  if (clues.address !== null) signals.push("address");
  if (clues.location !== null) signals.push("location");
  if (clues.linkFingerprint !== null) signals.push("user_link");
  if (clues.visualText !== null) signals.push("visual_text");
  return signals;
};

const toProviderRecord = (
  value: unknown,
  providerRank: number,
  signals: readonly RestaurantMatchSignal[],
  requestCorrelationId: string,
): GooglePlacesProviderRecord => {
  const place = isRecord(value) ? value : {};
  const coordinates = coordinatesFrom(place.location);
  return {
    requestCorrelationId,
    requestCandidateId: randomUUID(),
    placeId: stringValue(place.id) ?? "",
    primaryText: localizedText(place.displayName),
    formattedAddress: stringValue(place.formattedAddress),
    shortLocation: stringValue(place.shortFormattedAddress),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    signals,
    providerRank,
    officialWebsiteUrl: officialWebsiteFrom(place.websiteUri),
    localeEvidence: localeEvidenceFrom(place),
  };
};

export class GooglePlacesTextSearchAdapter
  implements GooglePlacesCandidateAdapter
{
  constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {
    if (apiKey.trim().length === 0) {
      throw new Error("Google Places API key is required.");
    }
  }

  async search(
    clues: NormalizedServerRestaurantClues,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly unknown[]>> {
    context.signal.throwIfAborted();
    const textQuery = [clues.name, clues.address, clues.visualText]
      .filter((value): value is string => value !== null)
      .join(" ")
      .trim();
    if (textQuery.length === 0) {
      return { status: "success", value: [] };
    }

    const requestBody: Record<string, unknown> = {
      textQuery,
      pageSize: 20,
    };
    if (clues.location !== null) {
      requestBody.locationBias = {
        circle: {
          center: clues.location,
          radius: 25_000,
        },
      };
    }

    const response = await this.fetchImplementation(
      GOOGLE_PLACES_TEXT_SEARCH_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
        },
        body: JSON.stringify(requestBody),
        signal: context.signal,
      },
    );
    if (!response.ok) {
      throw new Error("Google Places Text Search failed.");
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload)) {
      return { status: "success", value: [{}] };
    }
    const places = payload.places;
    if (places === undefined) {
      return { status: "success", value: [] };
    }
    if (!Array.isArray(places)) {
      return { status: "success", value: [{}] };
    }

    const signals = matchSignalsFrom(clues);
    return {
      status: "success",
      value: places.map((place, index) =>
        toProviderRecord(place, index + 1, signals, context.correlationId),
      ),
    };
  }
}
