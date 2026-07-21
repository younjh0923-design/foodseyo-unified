import {
  addContractIssue,
  createRuntimeSchema,
  validateArray,
  validateEnumValue,
  validateLiteral,
  validateNullableString,
  validateRecord,
  validateString,
  validateUniqueStrings,
  type ContractPathSegment,
  type ContractValidationIssue,
} from "./runtime-schema.js";
import { CANDIDATE_CONTRACT_VERSIONS } from "./versions.js";

export const WEB_EXPERIENCE_CONTRACT_STATUS = "candidate" as const;
export const WEB_EXPERIENCE_VERSION =
  CANDIDATE_CONTRACT_VERSIONS.webExperience;

export type WebExperienceVersion = typeof WEB_EXPERIENCE_VERSION;

export const UI_WORKFLOW_PHASES = [
  "official_source_lookup",
  "web_search_fallback",
] as const;

export const UI_WORKFLOW_PROGRESS_STATES = [
  "in_progress",
  "complete",
] as const;

export type UiWorkflowPhase = (typeof UI_WORKFLOW_PHASES)[number];
export type UiWorkflowProgressState =
  (typeof UI_WORKFLOW_PROGRESS_STATES)[number];

/**
 * Sensitive request-only input. The raw link and opaque handles must not be
 * logged, persisted, copied to public errors, or emitted as UI progress.
 * Correlation remains exclusively in PortInvocationContext.
 */
export interface SubmissionIntakeRequest {
  readonly contractVersion: WebExperienceVersion;
  readonly userSuppliedLink: string | null;
  readonly uploadedPhotoHandles: readonly string[];
  readonly requestedAt: string;
}

/**
 * UI-safe, non-terminal source-acquisition progress. Phase-local complete
 * never means canonical, publication, or overall workflow success.
 */
export interface UiWorkflowProgress {
  readonly contractVersion: WebExperienceVersion;
  readonly stage: "source_acquisition";
  readonly phase: UiWorkflowPhase;
  readonly state: UiWorkflowProgressState;
}

const SAFE_OPAQUE_HANDLE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;

const validateUtcTimestamp = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (
    validateString(value, issues, path, { minLength: 20, maxLength: 35 }) &&
    (!value.endsWith("Z") || Number.isNaN(Date.parse(value)))
  ) {
    addContractIssue(issues, "expected_utc_iso_timestamp", path);
  }
};

const validateSubmissionIntakeRequest = (
  value: unknown,
  issues: ContractValidationIssue[],
) => {
  if (
    !validateRecord(
      value,
      [
        "contractVersion",
        "userSuppliedLink",
        "uploadedPhotoHandles",
        "requestedAt",
      ],
      [],
      issues,
    )
  ) {
    return;
  }

  validateLiteral(
    value.contractVersion,
    WEB_EXPERIENCE_VERSION,
    issues,
    ["contractVersion"],
  );
  if (
    validateNullableString(
      value.userSuppliedLink,
      issues,
      ["userSuppliedLink"],
      { minLength: 1, maxLength: 2048 },
    ) &&
    typeof value.userSuppliedLink === "string" &&
    value.userSuppliedLink.trim().length === 0
  ) {
    addContractIssue(issues, "blank_user_supplied_link", [
      "userSuppliedLink",
    ]);
  }

  validateArray(
    value.uploadedPhotoHandles,
    issues,
    ["uploadedPhotoHandles"],
    (handle, handleIssues, handlePath) => {
      validateString(handle, handleIssues, handlePath, {
        minLength: 8,
        maxLength: 256,
        pattern: SAFE_OPAQUE_HANDLE_PATTERN,
      });
    },
  );
  validateUniqueStrings(
    value.uploadedPhotoHandles,
    issues,
    ["uploadedPhotoHandles"],
  );
  validateUtcTimestamp(value.requestedAt, issues, ["requestedAt"]);

  if (
    value.userSuppliedLink === null &&
    Array.isArray(value.uploadedPhotoHandles) &&
    value.uploadedPhotoHandles.length === 0
  ) {
    addContractIssue(issues, "submission_input_required", [
      "submissionIntakeRequest",
    ]);
  }
};

const validateUiWorkflowProgress = (
  value: unknown,
  issues: ContractValidationIssue[],
) => {
  if (
    !validateRecord(
      value,
      ["contractVersion", "stage", "phase", "state"],
      [],
      issues,
    )
  ) {
    return;
  }

  validateLiteral(
    value.contractVersion,
    WEB_EXPERIENCE_VERSION,
    issues,
    ["contractVersion"],
  );
  validateLiteral(value.stage, "source_acquisition", issues, ["stage"]);
  validateEnumValue(value.phase, UI_WORKFLOW_PHASES, issues, ["phase"]);
  validateEnumValue(
    value.state,
    UI_WORKFLOW_PROGRESS_STATES,
    issues,
    ["state"],
  );
};

export const SubmissionIntakeRequestSchema =
  createRuntimeSchema<SubmissionIntakeRequest>(
    "SubmissionIntakeRequest",
    validateSubmissionIntakeRequest,
  );

export const UiWorkflowProgressSchema =
  createRuntimeSchema<UiWorkflowProgress>(
    "UiWorkflowProgress",
    validateUiWorkflowProgress,
  );

export const WEB_EXPERIENCE_SCHEMAS = {
  SubmissionIntakeRequest: SubmissionIntakeRequestSchema,
  UiWorkflowProgress: UiWorkflowProgressSchema,
} as const;

export type WebExperienceSchemaName = keyof typeof WEB_EXPERIENCE_SCHEMAS;
