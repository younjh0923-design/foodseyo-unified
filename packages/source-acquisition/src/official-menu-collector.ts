import {
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  TransientMenuContentSchema,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type TransientMenuContent,
} from "@foodseyo/contracts";

import {
  OfficialMenuCollectorKind,
  selectOfficialMenuCollector,
  type OfficialMenuCollectorSelection,
} from "./official-menu-collector-selection.js";

export interface OfficialMenuCollector {
  readonly collectorKind: OfficialMenuCollectorKind;
  collect(
    selection: OfficialMenuCollectorSelection,
    context: PortInvocationContext,
  ): Promise<PortResult<TransientMenuContent>>;
}

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

const cloneSelection = (
  selection: OfficialMenuCollectorSelection,
): OfficialMenuCollectorSelection => ({
  candidate: { ...selection.candidate },
  collectorKind: selection.collectorKind,
});

const cloneContent = (content: TransientMenuContent): TransientMenuContent => ({
  ...content,
});

const validSelection = (
  selection: OfficialMenuCollectorSelection,
  context: PortInvocationContext,
): PortResult<OfficialMenuCollectorSelection> => {
  if (
    typeof selection !== "object" ||
    selection === null ||
    Array.isArray(selection) ||
    Object.keys(selection).length !== 2 ||
    !("candidate" in selection) ||
    !("collectorKind" in selection)
  ) {
    return {
      status: "error",
      error: publicError("INVALID_UPSTREAM_RESULT", context),
    };
  }
  const expected = selectOfficialMenuCollector(selection.candidate, context);
  if (
    expected.status !== "success" ||
    expected.value.collectorKind !== selection.collectorKind
  ) {
    return {
      status: "error",
      error: publicError("INVALID_UPSTREAM_RESULT", context),
    };
  }
  return { status: "success", value: cloneSelection(expected.value) };
};

abstract class DeterministicFakeOfficialMenuCollector
  implements OfficialMenuCollector
{
  #callCount = 0;
  #lastSelection: OfficialMenuCollectorSelection | null = null;
  readonly #result: PortResult<TransientMenuContent>;

  abstract readonly collectorKind: OfficialMenuCollectorKind;

  constructor(result: PortResult<TransientMenuContent>) {
    this.#result =
      result.status === "success"
        ? { status: "success", value: cloneContent(result.value) }
        : result;
  }

  get callCount(): number {
    return this.#callCount;
  }

  get lastSelection(): OfficialMenuCollectorSelection | null {
    return this.#lastSelection === null
      ? null
      : cloneSelection(this.#lastSelection);
  }

  collect(
    selection: OfficialMenuCollectorSelection,
    context: PortInvocationContext,
  ): Promise<PortResult<TransientMenuContent>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    const parsedSelection = validSelection(selection, context);
    if (
      parsedSelection.status !== "success" ||
      parsedSelection.value.collectorKind !== this.collectorKind
    ) {
      return Promise.resolve({
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      });
    }
    this.#lastSelection = cloneSelection(parsedSelection.value);
    return Promise.resolve(
      this.#result.status === "success"
        ? { status: "success", value: cloneContent(this.#result.value) }
        : this.#result,
    );
  }
}

export class FakeHtmlMenuPageCollector extends DeterministicFakeOfficialMenuCollector {
  readonly collectorKind = OfficialMenuCollectorKind.HTML_MENU_PAGE;
}

export class FakePdfMenuCollector extends DeterministicFakeOfficialMenuCollector {
  readonly collectorKind = OfficialMenuCollectorKind.PDF_MENU;
}

export class FakeOrderPageCollector extends DeterministicFakeOfficialMenuCollector {
  readonly collectorKind = OfficialMenuCollectorKind.ORDER_PAGE;
}

export class OfficialMenuCollectorService {
  constructor(
    private readonly html: OfficialMenuCollector,
    private readonly pdf: OfficialMenuCollector,
    private readonly orderPage: OfficialMenuCollector,
  ) {}

  async collect(
    selection: OfficialMenuCollectorSelection,
    context: PortInvocationContext,
  ): Promise<PortResult<TransientMenuContent>> {
    PortInvocationContextSchema.parse(context);
    const parsedSelection = validSelection(selection, context);
    if (parsedSelection.status !== "success") {
      return parsedSelection;
    }

    const collector = (() => {
      switch (parsedSelection.value.collectorKind) {
        case OfficialMenuCollectorKind.HTML_MENU_PAGE:
          return this.html;
        case OfficialMenuCollectorKind.PDF_MENU:
          return this.pdf;
        case OfficialMenuCollectorKind.ORDER_PAGE:
          return this.orderPage;
      }
    })();
    if (collector.collectorKind !== parsedSelection.value.collectorKind) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    let result: PortResult<TransientMenuContent>;
    try {
      result = await collector.collect(parsedSelection.value, context);
    } catch {
      return {
        status: "error",
        error: publicError("UPSTREAM_UNAVAILABLE", context),
      };
    }
    if (result.status !== "success") {
      return result;
    }

    const parsedContent = TransientMenuContentSchema.safeParse(result.value);
    if (!parsedContent.success) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    return { status: "success", value: cloneContent(parsedContent.data) };
  }
}
