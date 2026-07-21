type PublicRuntimeSurface = typeof import("./index.js");

type AssertNever<T extends never> = T;

type ForbiddenRawRuntimeExports = Extract<
  keyof PublicRuntimeSurface,
  | "RequestScopedOfficialMenuContentStore"
  | "BoundedHtmlMenuPageCollector"
  | "BoundedPdfMenuCollector"
  | "BoundedOrderPageCollector"
>;

type RawRuntimeBoundaryMustRemainInternal = AssertNever<
  ForbiddenRawRuntimeExports
>;

// Negative compile-time API assertions: these directives become errors if a
// raw storage/read type is accidentally re-exported from the package entry.
// @ts-expect-error OfficialMenuContentStoreInput is package-internal.
import type { OfficialMenuContentStoreInput } from "./index.js";
// @ts-expect-error OfficialMenuTransientContentStore is package-internal.
import type { OfficialMenuTransientContentStore } from "./index.js";

export type { RawRuntimeBoundaryMustRemainInternal };
