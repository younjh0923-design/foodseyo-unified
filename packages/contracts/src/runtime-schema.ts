export type ContractPathSegment = string | number;

export interface ContractValidationIssue {
  readonly code: string;
  readonly path: readonly ContractPathSegment[];
}

export type SafeParseResult<T> =
  | {
      readonly success: true;
      readonly data: T;
    }
  | {
      readonly success: false;
      readonly issues: readonly ContractValidationIssue[];
    };

export interface RuntimeContractSchema<T> {
  readonly name: string;
  parse(value: unknown): T;
  safeParse(value: unknown): SafeParseResult<T>;
}

export class ContractValidationError extends Error {
  readonly issues: readonly ContractValidationIssue[];

  constructor(
    schemaName: string,
    issues: readonly ContractValidationIssue[],
  ) {
    super(`${schemaName} contract validation failed`);
    this.name = "ContractValidationError";
    this.issues = issues;
  }
}

export type ContractValidator = (
  value: unknown,
  issues: ContractValidationIssue[],
) => void;

export const createRuntimeSchema = <T>(
  name: string,
  validate: ContractValidator,
): RuntimeContractSchema<T> => ({
  name,
  parse(value: unknown): T {
    const result = this.safeParse(value);
    if (!result.success) {
      throw new ContractValidationError(name, result.issues);
    }
    return result.data;
  },
  safeParse(value: unknown): SafeParseResult<T> {
    const issues: ContractValidationIssue[] = [];
    validate(value, issues);
    return issues.length === 0
      ? { success: true, data: value as T }
      : { success: false, issues };
  },
});

export const addContractIssue = (
  issues: ContractValidationIssue[],
  code: string,
  path: readonly ContractPathSegment[] = [],
) => {
  issues.push({ code, path });
};

export const isContractRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const validateRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[] = [],
): value is Readonly<Record<string, unknown>> => {
  if (!isContractRecord(value)) {
    addContractIssue(issues, "expected_object", path);
    return false;
  }

  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of requiredKeys) {
    if (!(key in value)) {
      addContractIssue(issues, "missing_required_field", [...path, key]);
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      addContractIssue(issues, "unexpected_field", [...path, key]);
    }
  }
  return true;
};

export const validateString = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
  options: {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: RegExp;
  } = {},
): value is string => {
  if (typeof value !== "string") {
    addContractIssue(issues, "expected_string", path);
    return false;
  }
  if (options.minLength !== undefined && value.length < options.minLength) {
    addContractIssue(issues, "string_too_short", path);
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    addContractIssue(issues, "string_too_long", path);
  }
  if (options.pattern !== undefined && !options.pattern.test(value)) {
    addContractIssue(issues, "invalid_string_format", path);
  }
  return true;
};

export const validateNullableString = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
  options: {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: RegExp;
  } = {},
): value is string | null =>
  value === null || validateString(value, issues, path, options);

export const validateBoolean = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
): value is boolean => {
  if (typeof value !== "boolean") {
    addContractIssue(issues, "expected_boolean", path);
    return false;
  }
  return true;
};

export const validateInteger = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
  options: {
    readonly minimum?: number;
    readonly maximum?: number;
  } = {},
): value is number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    addContractIssue(issues, "expected_safe_integer", path);
    return false;
  }
  if (options.minimum !== undefined && value < options.minimum) {
    addContractIssue(issues, "number_below_minimum", path);
  }
  if (options.maximum !== undefined && value > options.maximum) {
    addContractIssue(issues, "number_above_maximum", path);
  }
  return true;
};

export const validateFiniteNumber = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
  options: {
    readonly minimum?: number;
    readonly maximum?: number;
  } = {},
): value is number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addContractIssue(issues, "expected_finite_number", path);
    return false;
  }
  if (options.minimum !== undefined && value < options.minimum) {
    addContractIssue(issues, "number_below_minimum", path);
  }
  if (options.maximum !== undefined && value > options.maximum) {
    addContractIssue(issues, "number_above_maximum", path);
  }
  return true;
};

export const validateLiteral = <T extends string | number | boolean>(
  value: unknown,
  literal: T,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
): value is T => {
  if (value !== literal) {
    addContractIssue(issues, "invalid_literal", path);
    return false;
  }
  return true;
};

export const validateEnumValue = <T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
): value is T => {
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    addContractIssue(issues, "invalid_enum_value", path);
    return false;
  }
  return true;
};

export const validateArray = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
  validateItem: (
    item: unknown,
    issues: ContractValidationIssue[],
    path: readonly ContractPathSegment[],
  ) => void,
  options: {
    readonly minLength?: number;
    readonly maxLength?: number;
  } = {},
): value is readonly unknown[] => {
  if (!Array.isArray(value)) {
    addContractIssue(issues, "expected_array", path);
    return false;
  }
  if (options.minLength !== undefined && value.length < options.minLength) {
    addContractIssue(issues, "array_too_short", path);
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    addContractIssue(issues, "array_too_long", path);
  }
  value.forEach((item, index) => {
    validateItem(item, issues, [...path, index]);
  });
  return true;
};

export const validateUniqueStrings = (
  value: unknown,
  issues: ContractValidationIssue[],
  path: readonly ContractPathSegment[],
) => {
  if (!Array.isArray(value)) {
    return;
  }
  const strings = value.filter((item): item is string => typeof item === "string");
  if (new Set(strings).size !== strings.length) {
    addContractIssue(issues, "duplicate_array_value", path);
  }
};
