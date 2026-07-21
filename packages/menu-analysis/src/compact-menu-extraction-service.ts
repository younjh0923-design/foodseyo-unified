import type {
  CompactMenuExtraction,
  CompactMenuExtractionPort,
  MenuSourceInput,
  PortInvocationContext,
  PortResult,
} from "@foodseyo/contracts";

export class CompactMenuExtractionService {
  constructor(private readonly extractionPort: CompactMenuExtractionPort) {}

  extract(
    input: MenuSourceInput,
    context: PortInvocationContext,
  ): Promise<PortResult<CompactMenuExtraction>> {
    return this.extractionPort.extract(input, context);
  }
}
