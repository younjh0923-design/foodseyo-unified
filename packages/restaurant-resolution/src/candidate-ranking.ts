import {
  type GeoPoint,
  type RestaurantCandidate,
} from "@foodseyo/contracts";

export interface RestaurantCandidateRankingClues {
  readonly name: string | null;
  readonly location: GeoPoint | null;
}

export interface RestaurantCandidateRankingOptions {
  readonly limit?: number;
}

interface ScoredCandidate {
  readonly candidate: RestaurantCandidate;
  readonly nameScore: number;
  readonly distanceMeters: number;
  readonly stableSnapshotKey: string;
}

const MAX_RANKED_CANDIDATES = 6;

const normalizedWords = (value: string): readonly string[] =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .match(/[\p{L}\p{N}]+/gu) ?? [];

const normalizedName = (value: string): string =>
  normalizedWords(value).join(" ");

const nameMatchScore = (
  candidateName: string,
  clueName: string | null,
): number => {
  if (clueName === null) {
    return 0;
  }
  const candidate = normalizedName(candidateName);
  const clue = normalizedName(clueName);
  if (candidate.length === 0 || clue.length === 0) {
    return 0;
  }
  if (candidate === clue) {
    return 100;
  }
  if (candidate.startsWith(`${clue} `) || clue.startsWith(`${candidate} `)) {
    return 80;
  }

  const candidateTokens = new Set(candidate.split(" "));
  const clueTokens = new Set(clue.split(" "));
  const sharedTokenCount = [...clueTokens].filter((token) =>
    candidateTokens.has(token),
  ).length;
  if (
    sharedTokenCount === clueTokens.size ||
    sharedTokenCount === candidateTokens.size
  ) {
    return 70;
  }
  if (candidate.includes(clue) || clue.includes(candidate)) {
    return 60;
  }
  return Math.floor(
    (50 * sharedTokenCount) /
      Math.max(candidateTokens.size, clueTokens.size),
  );
};

const distanceMeters = (
  origin: GeoPoint | null,
  destination: GeoPoint | null,
): number => {
  if (origin === null || destination === null) {
    return Number.POSITIVE_INFINITY;
  }
  const radians = (value: number): number => (value * Math.PI) / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(destination.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    6_371_000 *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
};

const stableSnapshotKey = (candidate: RestaurantCandidate): string =>
  [
    normalizedName(candidate.displayName),
    candidate.fullAddress ?? "",
    candidate.shortAddress ?? "",
    candidate.location?.latitude.toString() ?? "",
    candidate.location?.longitude.toString() ?? "",
    [...candidate.matchSignals].sort().join(","),
    candidate.officialWebsiteUrl ?? "",
    candidate.localeEvidence?.countryCode ?? "",
    candidate.localeEvidence?.countryBasis ?? "",
    candidate.localeEvidence?.currencyCode ?? "",
    candidate.localeEvidence?.currencyBasis ?? "",
  ].join("\u0000");

const compareScoredCandidates = (
  left: ScoredCandidate,
  right: ScoredCandidate,
): number => {
  if (left.nameScore !== right.nameScore) {
    return right.nameScore - left.nameScore;
  }
  if (left.distanceMeters !== right.distanceMeters) {
    return left.distanceMeters - right.distanceMeters;
  }
  if (left.candidate.rank !== right.candidate.rank) {
    return left.candidate.rank - right.candidate.rank;
  }
  const placeIdOrder = left.candidate.googlePlaceId.localeCompare(
    right.candidate.googlePlaceId,
  );
  if (placeIdOrder !== 0) {
    return placeIdOrder;
  }
  const snapshotOrder = left.stableSnapshotKey.localeCompare(
    right.stableSnapshotKey,
  );
  if (snapshotOrder !== 0) {
    return snapshotOrder;
  }
  return left.candidate.candidateId.localeCompare(right.candidate.candidateId);
};

export const rankRestaurantCandidates = (
  candidates: readonly RestaurantCandidate[],
  clues: RestaurantCandidateRankingClues,
  options: RestaurantCandidateRankingOptions = {},
): readonly RestaurantCandidate[] => {
  const requestedLimit = options.limit ?? MAX_RANKED_CANDIDATES;
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw new RangeError("Restaurant candidate limit must be a positive integer.");
  }
  const limit = Math.min(requestedLimit, MAX_RANKED_CANDIDATES);
  const scored = candidates.map(
    (candidate): ScoredCandidate => ({
      candidate,
      nameScore: nameMatchScore(candidate.displayName, clues.name),
      distanceMeters: distanceMeters(clues.location, candidate.location),
      stableSnapshotKey: stableSnapshotKey(candidate),
    }),
  );

  const byPlaceId = new Map<string, ScoredCandidate>();
  for (const candidate of scored) {
    const current = byPlaceId.get(candidate.candidate.googlePlaceId);
    // Keep one complete input snapshot: the comparator chooses deterministically
    // without merging fields or inferring facts across duplicate provider rows.
    if (
      current === undefined ||
      compareScoredCandidates(candidate, current) < 0
    ) {
      byPlaceId.set(candidate.candidate.googlePlaceId, candidate);
    }
  }

  return [...byPlaceId.values()]
    .sort(compareScoredCandidates)
    .slice(0, limit)
    .map(({ candidate }, index) => ({ ...candidate, rank: index + 1 }));
};
