export const LEGACY_READ_ONLY_CODE = "LEGACY_READ_ONLY" as const;
export const LEGACY_READ_ONLY_MESSAGE =
  "This legacy Foodseyo demo is read-only. Live analysis is no longer available.";

export const legacyReadOnlyResponse = (): Response =>
  Response.json(
    {
      ok: false,
      error: {
        code: LEGACY_READ_ONLY_CODE,
        message: LEGACY_READ_ONLY_MESSAGE,
        retryable: false,
      },
    },
    {
      status: 410,
      headers: { "cache-control": "no-store" },
    },
  );
