import { legacyReadOnlyResponse } from "../legacy-read-only.js";

export function POST(_request: Request): Response {
  return legacyReadOnlyResponse();
}
