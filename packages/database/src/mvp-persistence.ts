import {
  CanonicalMenuAnalysisSchema,
  type CanonicalMenuAnalysis,
  type MenuSourceType,
} from "@foodseyo/contracts";
import type { Pool, PoolClient, QueryResultRow } from "pg";

export interface SemanticVersionVector {
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly providerSchemaVersion: string;
  readonly menuSourceVersion: string;
  readonly restaurantResolutionVersion: string;
  readonly compactExtractionVersion: string;
  readonly analysisSnapshotVersion: string;
  readonly consistencyVersion: string;
  readonly dishKnowledgeVersion: string;
  readonly mergePolicyVersion: string;
  readonly explanationRendererVersion: string;
  readonly boundaryDtoVersion: string;
  readonly moduleInterfaceVersion: string;
  readonly exactCacheKeyVersion: string;
}

export interface ExactIdentityRequest {
  readonly analysisContractId: string;
  readonly evidenceSetId: string;
  readonly sourceRef: string;
  readonly sourceType: MenuSourceType;
  readonly sourceFingerprint: string;
  readonly evidenceIdentityVersion: string;
  readonly collectedAt: string;
  readonly createdAt: string;
  readonly versions: SemanticVersionVector;
}

export interface ExactAnalysisIdentity {
  readonly analysisContractId: string;
  readonly evidenceSetId: string;
  readonly sourceRef: string;
}

export interface AnalysisOwner {
  readonly runId: string;
  readonly attemptNumber: number;
  readonly leaseExpiresAt: string;
}

export type OwnerAcquisition =
  | { readonly status: "owner"; readonly owner: AnalysisOwner }
  | { readonly status: "waiting"; readonly owner: AnalysisOwner }
  | {
      readonly status: "reusable";
      readonly analysis: CanonicalMenuAnalysis;
    }
  | {
      readonly status: "terminal";
      readonly safeErrorCode: SafeAnalysisErrorCode;
    };

export type WaitResult =
  | {
      readonly status: "reusable";
      readonly analysis: CanonicalMenuAnalysis;
    }
  | {
      readonly status: "terminal";
      readonly safeErrorCode: SafeAnalysisErrorCode;
    }
  | { readonly status: "busy" };

export type SafeAnalysisErrorCode =
  | "ANALYSIS_TEMPORARILY_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "INVALID_UPSTREAM_RESULT"
  | "UPSTREAM_TIMEOUT";

export interface AcquireOwnerRequest {
  readonly identity: ExactAnalysisIdentity;
  readonly runId: string;
  readonly startedAt: string;
  readonly leaseExpiresAt: string;
}

export interface MarkAnalysisFailureRequest {
  readonly identity: ExactAnalysisIdentity;
  readonly runId: string;
  readonly kind: "retryable" | "terminal";
  readonly safeErrorCode: SafeAnalysisErrorCode;
  readonly finishedAt: string;
}

export interface PersistAnalysisOnlyRequest {
  readonly identity: ExactAnalysisIdentity;
  readonly runId: string;
  readonly analysis: CanonicalMenuAnalysis;
  readonly persistedAt: string;
  readonly expiresAt: string;
}

export interface WaitPolicy {
  readonly maxPolls: number;
  readonly pollIntervalMs: number;
}

export type WaitScheduler = (
  delayMs: number,
  completedPolls: number,
) => Promise<void>;

export interface MvpAnalysisRepository {
  resolveExactIdentity(request: ExactIdentityRequest): Promise<ExactAnalysisIdentity>;
  findReusableCanonicalAnalysis(
    identity: ExactAnalysisIdentity,
    observedAt: string,
  ): Promise<CanonicalMenuAnalysis | null>;
  acquireAnalysisOwner(request: AcquireOwnerRequest): Promise<OwnerAcquisition>;
  waitForReusableCanonicalAnalysis(
    identity: ExactAnalysisIdentity,
    policy: WaitPolicy,
    observedAt: () => string,
    scheduler?: WaitScheduler,
  ): Promise<WaitResult>;
  markAnalysisFailure(request: MarkAnalysisFailureRequest): Promise<void>;
  persistAnalysisOnly(
    request: PersistAnalysisOnlyRequest,
  ): Promise<CanonicalMenuAnalysis>;
}

export class StaleAnalysisOwnerError extends Error {
  constructor() {
    super("analysis owner is stale or no longer active");
    this.name = "StaleAnalysisOwnerError";
  }
}

export class PersistenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceContractError";
  }
}

export interface SqlQueryResult<Row extends QueryResultRow> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}

export interface SqlExecutor {
  query<Row extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

export interface SqlTransactionRunner {
  transaction<T>(operation: (executor: SqlExecutor) => Promise<T>): Promise<T>;
  query<Row extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

const asExecutor = (client: PoolClient): SqlExecutor => ({
  query: async <Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ) => client.query<Row>(text, [...values]),
});

export class PgSqlTransactionRunner implements SqlTransactionRunner {
  constructor(private readonly pool: Pool) {}

  query<Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    return this.pool.query<Row>(text, [...values]);
  }

  async transaction<T>(
    operation: (executor: SqlExecutor) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await operation(asExecutor(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

const semanticVersionKeys = [
  "modelVersion",
  "promptVersion",
  "providerSchemaVersion",
  "menuSourceVersion",
  "restaurantResolutionVersion",
  "compactExtractionVersion",
  "analysisSnapshotVersion",
  "consistencyVersion",
  "dishKnowledgeVersion",
  "mergePolicyVersion",
  "explanationRendererVersion",
  "boundaryDtoVersion",
  "moduleInterfaceVersion",
  "exactCacheKeyVersion",
] as const;

const semanticVersionColumns = [
  "model_version",
  "prompt_version",
  "provider_schema_version",
  "menu_source_version",
  "restaurant_resolution_version",
  "compact_extraction_version",
  "analysis_snapshot_version",
  "consistency_version",
  "dish_knowledge_version",
  "merge_policy_version",
  "explanation_renderer_version",
  "boundary_dto_version",
  "module_interface_version",
  "exact_cache_key_version",
] as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const requireUuid = (value: string, name: string): void => {
  if (!uuidPattern.test(value)) {
    throw new PersistenceContractError(`${name} must be an application UUID`);
  }
};

const requireNonblank = (value: string, name: string): void => {
  if (value.trim() === "") {
    throw new PersistenceContractError(`${name} must be nonblank`);
  }
};

const requireTimestamp = (value: string, name: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new PersistenceContractError(`${name} must be an ISO timestamp`);
  }
  return timestamp;
};

const validateIdentity = (identity: ExactAnalysisIdentity): void => {
  requireUuid(identity.analysisContractId, "analysisContractId");
  requireUuid(identity.evidenceSetId, "evidenceSetId");
  requireUuid(identity.sourceRef, "sourceRef");
};

const validateWaitPolicy = (policy: WaitPolicy): void => {
  if (!Number.isSafeInteger(policy.maxPolls) || policy.maxPolls < 0) {
    throw new PersistenceContractError("maxPolls must be a nonnegative integer");
  }
  if (!Number.isSafeInteger(policy.pollIntervalMs) || policy.pollIntervalMs < 0) {
    throw new PersistenceContractError(
      "pollIntervalMs must be a nonnegative integer",
    );
  }
};

const defaultWaitScheduler: WaitScheduler = (delayMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

interface CanonicalRow extends QueryResultRow {
  readonly canonical_analysis_json: unknown;
}

interface RunRow extends QueryResultRow {
  readonly id: string;
  readonly attempt_number: number;
  readonly lease_expires_at: string;
  readonly safe_error_code: SafeAnalysisErrorCode | null;
  readonly status: "failed_terminal" | "processing";
}

const parseCanonicalRow = (row: CanonicalRow): CanonicalMenuAnalysis =>
  CanonicalMenuAnalysisSchema.parse(row.canonical_analysis_json);

const findReusable = async (
  executor: SqlExecutor,
  identity: ExactAnalysisIdentity,
  observedAt: string,
): Promise<CanonicalMenuAnalysis | null> => {
  const result = await executor.query<CanonicalRow>(
    `select ca.canonical_analysis_json
       from canonical_analyses ca
       join analysis_runs ar on ar.id = ca.producing_run_id
       left join publication_receipts pr on pr.analysis_id = ca.id
      where ca.evidence_set_id = $1
        and ca.analysis_contract_id = $2
        and ca.invalidated_at is null
        and ca.expires_at > $3::timestamptz
        and ar.status = 'ready'
        and (ca.publication_state = 'analysis_only' or pr.analysis_id is not null)
      order by ca.created_at desc
      limit 1`,
    [identity.evidenceSetId, identity.analysisContractId, observedAt],
  );
  return result.rows[0] ? parseCanonicalRow(result.rows[0]) : null;
};

const readBlockingRun = async (
  executor: SqlExecutor,
  identity: ExactAnalysisIdentity,
): Promise<RunRow | null> => {
  const result = await executor.query<RunRow>(
    `select id, attempt_number, lease_expires_at, safe_error_code, status
       from analysis_runs
      where evidence_set_id = $1
        and analysis_contract_id = $2
        and status in ('processing', 'failed_terminal')
      order by attempt_number desc
      limit 1`,
    [identity.evidenceSetId, identity.analysisContractId],
  );
  return result.rows[0] ?? null;
};

const runRowToOwner = (run: RunRow): AnalysisOwner => ({
  runId: run.id,
  attemptNumber: run.attempt_number,
  leaseExpiresAt: run.lease_expires_at,
});

export class PostgresMvpAnalysisRepository implements MvpAnalysisRepository {
  constructor(private readonly sql: SqlTransactionRunner) {}

  async resolveExactIdentity(
    request: ExactIdentityRequest,
  ): Promise<ExactAnalysisIdentity> {
    requireUuid(request.analysisContractId, "analysisContractId");
    requireUuid(request.evidenceSetId, "evidenceSetId");
    requireUuid(request.sourceRef, "sourceRef");
    requireNonblank(request.sourceFingerprint, "sourceFingerprint");
    requireNonblank(request.evidenceIdentityVersion, "evidenceIdentityVersion");
    requireTimestamp(request.collectedAt, "collectedAt");
    requireTimestamp(request.createdAt, "createdAt");
    for (const key of semanticVersionKeys) {
      requireNonblank(request.versions[key], key);
    }

    return this.sql.transaction(async (executor) => {
      const versionValues = semanticVersionKeys.map((key) => request.versions[key]);
      await executor.query(
        `insert into analysis_contracts (
          id, ${semanticVersionColumns.join(", ")}, created_at
        ) values (
          $1, ${semanticVersionColumns.map((_, index) => `$${index + 2}`).join(", ")}, $16
        ) on conflict (${semanticVersionColumns.join(", ")}) do nothing`,
        [request.analysisContractId, ...versionValues, request.createdAt],
      );
      const contract = await executor.query<{ readonly id: string }>(
        `select id from analysis_contracts where ${semanticVersionColumns
          .map((column, index) => `${column} = $${index + 1}`)
          .join(" and ")} limit 1`,
        versionValues,
      );
      const analysisContractId = contract.rows[0]?.id;
      if (!analysisContractId) {
        throw new PersistenceContractError("semantic identity resolution failed");
      }

      await executor.query(
        `insert into menu_evidence_sets (
          id, source_ref, source_type, source_fingerprint,
          evidence_identity_version, collected_at, created_at
        ) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (source_fingerprint, evidence_identity_version) do nothing`,
        [
          request.evidenceSetId,
          request.sourceRef,
          request.sourceType,
          request.sourceFingerprint,
          request.evidenceIdentityVersion,
          request.collectedAt,
          request.createdAt,
        ],
      );
      const evidence = await executor.query<{
        readonly id: string;
        readonly source_ref: string;
      }>(
        `select id, source_ref
           from menu_evidence_sets
          where source_fingerprint = $1 and evidence_identity_version = $2
          limit 1`,
        [request.sourceFingerprint, request.evidenceIdentityVersion],
      );
      const evidenceRow = evidence.rows[0];
      if (!evidenceRow) {
        throw new PersistenceContractError("evidence identity resolution failed");
      }
      return {
        analysisContractId,
        evidenceSetId: evidenceRow.id,
        sourceRef: evidenceRow.source_ref,
      };
    });
  }

  findReusableCanonicalAnalysis(
    identity: ExactAnalysisIdentity,
    observedAt: string,
  ): Promise<CanonicalMenuAnalysis | null> {
    validateIdentity(identity);
    requireTimestamp(observedAt, "observedAt");
    return findReusable(this.sql, identity, observedAt);
  }

  async acquireAnalysisOwner(
    request: AcquireOwnerRequest,
  ): Promise<OwnerAcquisition> {
    validateIdentity(request.identity);
    requireUuid(request.runId, "runId");
    const startedAt = requireTimestamp(request.startedAt, "startedAt");
    const leaseExpiresAt = requireTimestamp(
      request.leaseExpiresAt,
      "leaseExpiresAt",
    );
    if (leaseExpiresAt <= startedAt) {
      throw new PersistenceContractError("lease must expire after it starts");
    }

    const reusable = await this.findReusableCanonicalAnalysis(
      request.identity,
      request.startedAt,
    );
    if (reusable) {
      return { status: "reusable", analysis: reusable };
    }

    return this.sql.transaction(async (executor) => {
      const blocking = await readBlockingRun(executor, request.identity);
      if (blocking?.status === "failed_terminal") {
        if (!blocking.safe_error_code) {
          throw new PersistenceContractError("terminal run lacks safe error code");
        }
        return { status: "terminal", safeErrorCode: blocking.safe_error_code };
      }
      if (blocking?.status === "processing") {
        if (Date.parse(blocking.lease_expires_at) > startedAt) {
          return { status: "waiting", owner: runRowToOwner(blocking) };
        }
        await executor.query(
          `update analysis_runs
              set status = 'failed_retryable', lease_expires_at = null,
                  finished_at = $4, safe_error_code = 'ANALYSIS_TEMPORARILY_UNAVAILABLE',
                  updated_at = $4
            where id = $1 and evidence_set_id = $2 and analysis_contract_id = $3
              and status = 'processing' and lease_expires_at <= $4::timestamptz`,
          [
            blocking.id,
            request.identity.evidenceSetId,
            request.identity.analysisContractId,
            request.startedAt,
          ],
        );
      }

      const inserted = await executor.query<RunRow>(
        `insert into analysis_runs (
          id, evidence_set_id, analysis_contract_id, attempt_number, status,
          lease_expires_at, started_at, finished_at, safe_error_code,
          created_at, updated_at
        ) select $1, $2, $3, coalesce(max(attempt_number), 0) + 1,
                 'processing', $4, $5, null, null, $5, $5
            from analysis_runs
           where evidence_set_id = $2 and analysis_contract_id = $3
        on conflict do nothing
        returning id, attempt_number, lease_expires_at, safe_error_code, status`,
        [
          request.runId,
          request.identity.evidenceSetId,
          request.identity.analysisContractId,
          request.leaseExpiresAt,
          request.startedAt,
        ],
      );
      const newOwner = inserted.rows[0];
      if (newOwner) {
        return { status: "owner", owner: runRowToOwner(newOwner) };
      }
      const winner = await readBlockingRun(executor, request.identity);
      if (winner?.status === "processing") {
        return { status: "waiting", owner: runRowToOwner(winner) };
      }
      if (winner?.status === "failed_terminal" && winner.safe_error_code) {
        return { status: "terminal", safeErrorCode: winner.safe_error_code };
      }
      throw new PersistenceContractError("owner acquisition conflict was unresolved");
    });
  }

  async waitForReusableCanonicalAnalysis(
    identity: ExactAnalysisIdentity,
    policy: WaitPolicy,
    observedAt: () => string,
    scheduler: WaitScheduler = defaultWaitScheduler,
  ): Promise<WaitResult> {
    validateIdentity(identity);
    validateWaitPolicy(policy);
    for (let poll = 0; poll < policy.maxPolls; poll += 1) {
      await scheduler(policy.pollIntervalMs, poll);
      const now = observedAt();
      requireTimestamp(now, "observedAt");
      const reusable = await this.findReusableCanonicalAnalysis(identity, now);
      if (reusable) {
        return { status: "reusable", analysis: reusable };
      }
      const blocking = await readBlockingRun(this.sql, identity);
      if (blocking?.status === "failed_terminal" && blocking.safe_error_code) {
        return { status: "terminal", safeErrorCode: blocking.safe_error_code };
      }
    }
    return { status: "busy" };
  }

  async markAnalysisFailure(
    request: MarkAnalysisFailureRequest,
  ): Promise<void> {
    validateIdentity(request.identity);
    requireUuid(request.runId, "runId");
    requireTimestamp(request.finishedAt, "finishedAt");
    const result = await this.sql.query(
      `update analysis_runs
          set status = $4, lease_expires_at = null, finished_at = $5,
              safe_error_code = $6, updated_at = $5
        where id = $1 and evidence_set_id = $2 and analysis_contract_id = $3
          and status = 'processing' and lease_expires_at > $5::timestamptz`,
      [
        request.runId,
        request.identity.evidenceSetId,
        request.identity.analysisContractId,
        request.kind === "retryable" ? "failed_retryable" : "failed_terminal",
        request.finishedAt,
        request.safeErrorCode,
      ],
    );
    if (result.rowCount !== 1) {
      throw new StaleAnalysisOwnerError();
    }
  }

  async persistAnalysisOnly(
    request: PersistAnalysisOnlyRequest,
  ): Promise<CanonicalMenuAnalysis> {
    validateIdentity(request.identity);
    requireUuid(request.runId, "runId");
    const persistedAt = requireTimestamp(request.persistedAt, "persistedAt");
    const expiresAt = requireTimestamp(request.expiresAt, "expiresAt");
    if (expiresAt <= persistedAt) {
      throw new PersistenceContractError("expiresAt must follow persistedAt");
    }
    const analysis = CanonicalMenuAnalysisSchema.parse(request.analysis);
    if (analysis.publicationState !== "analysis_only" || analysis.menuVersion !== null) {
      throw new PersistenceContractError(
        "menu-only persistence accepts only analysis_only canonical analyses",
      );
    }
    if (analysis.source.sourceRef !== request.identity.sourceRef) {
      throw new PersistenceContractError("canonical source does not match exact identity");
    }

    return this.sql.transaction(async (executor) => {
      const owner = await executor.query<{ readonly id: string }>(
        `select id from analysis_runs
          where id = $1 and evidence_set_id = $2 and analysis_contract_id = $3
            and status = 'processing' and lease_expires_at > $4::timestamptz
          for update`,
        [
          request.runId,
          request.identity.evidenceSetId,
          request.identity.analysisContractId,
          request.persistedAt,
        ],
      );
      if (!owner.rows[0]) {
        throw new StaleAnalysisOwnerError();
      }
      await executor.query(
        `insert into canonical_analyses (
          id, evidence_set_id, analysis_contract_id, producing_run_id,
          publication_state, restaurant_id, restaurant_menu_version_id,
          canonical_analysis_json, validated_at, created_at, last_accessed_at,
          expires_at, invalidated_at, safe_invalidation_code
        ) values ($1, $2, $3, $4, 'analysis_only', null, null, $5::jsonb,
                  $6, $7, $7, $8, null, null)`,
        [
          analysis.analysisId,
          request.identity.evidenceSetId,
          request.identity.analysisContractId,
          request.runId,
          JSON.stringify(analysis),
          analysis.validatedAt,
          request.persistedAt,
          request.expiresAt,
        ],
      );
      const ready = await executor.query(
        `update analysis_runs
            set status = 'ready', lease_expires_at = null, finished_at = $4,
                safe_error_code = null, updated_at = $4
          where id = $1 and evidence_set_id = $2 and analysis_contract_id = $3
            and status = 'processing' and lease_expires_at > $4::timestamptz`,
        [
          request.runId,
          request.identity.evidenceSetId,
          request.identity.analysisContractId,
          request.persistedAt,
        ],
      );
      if (ready.rowCount !== 1) {
        throw new StaleAnalysisOwnerError();
      }
      return analysis;
    });
  }
}

interface MemoryEvidenceIdentity {
  readonly id: string;
  readonly sourceRef: string;
}

interface MemoryRun {
  readonly identityKey: string;
  readonly owner: AnalysisOwner;
  status: "failed_retryable" | "failed_terminal" | "processing" | "ready";
  safeErrorCode: SafeAnalysisErrorCode | null;
}

interface MemoryCanonical {
  readonly analysis: CanonicalMenuAnalysis;
  readonly expiresAt: string;
  readonly identityKey: string;
  readonly runId: string;
}

export interface DeterministicPersistenceCounts {
  readonly analysisContracts: number;
  readonly analysisRuns: number;
  readonly canonicalAnalyses: number;
  readonly dishes: number;
  readonly menuEvidenceSets: number;
  readonly menuItemDishMatches: number;
  readonly menuItems: number;
  readonly publicationReceipts: number;
  readonly restaurantExternalReferences: number;
  readonly restaurantMenuVersions: number;
  readonly restaurants: number;
}

const exactIdentityKey = (identity: ExactAnalysisIdentity): string =>
  `${identity.evidenceSetId}:${identity.analysisContractId}`;

export class DeterministicMvpAnalysisRepository
  implements MvpAnalysisRepository
{
  readonly #contracts = new Map<string, string>();
  readonly #evidence = new Map<string, MemoryEvidenceIdentity>();
  readonly #runs: MemoryRun[] = [];
  readonly #canonical: MemoryCanonical[] = [];
  readonly #runIds = new Set<string>();

  snapshotCounts(): DeterministicPersistenceCounts {
    return {
      analysisContracts: this.#contracts.size,
      analysisRuns: this.#runs.length,
      canonicalAnalyses: this.#canonical.length,
      dishes: 0,
      menuEvidenceSets: this.#evidence.size,
      menuItemDishMatches: 0,
      menuItems: 0,
      publicationReceipts: 0,
      restaurantExternalReferences: 0,
      restaurantMenuVersions: 0,
      restaurants: 0,
    };
  }

  async resolveExactIdentity(
    request: ExactIdentityRequest,
  ): Promise<ExactAnalysisIdentity> {
    requireUuid(request.analysisContractId, "analysisContractId");
    requireUuid(request.evidenceSetId, "evidenceSetId");
    requireUuid(request.sourceRef, "sourceRef");
    requireNonblank(request.sourceFingerprint, "sourceFingerprint");
    requireNonblank(request.evidenceIdentityVersion, "evidenceIdentityVersion");
    requireTimestamp(request.collectedAt, "collectedAt");
    requireTimestamp(request.createdAt, "createdAt");
    for (const key of semanticVersionKeys) {
      requireNonblank(request.versions[key], key);
    }

    const contractKey = semanticVersionKeys
      .map((key) => request.versions[key])
      .join("\u001f");
    const analysisContractId =
      this.#contracts.get(contractKey) ?? request.analysisContractId;
    this.#contracts.set(contractKey, analysisContractId);

    const evidenceKey = `${request.sourceFingerprint}\u001f${request.evidenceIdentityVersion}`;
    const evidence = this.#evidence.get(evidenceKey) ?? {
      id: request.evidenceSetId,
      sourceRef: request.sourceRef,
    };
    this.#evidence.set(evidenceKey, evidence);
    return {
      analysisContractId,
      evidenceSetId: evidence.id,
      sourceRef: evidence.sourceRef,
    };
  }

  async findReusableCanonicalAnalysis(
    identity: ExactAnalysisIdentity,
    observedAt: string,
  ): Promise<CanonicalMenuAnalysis | null> {
    validateIdentity(identity);
    const observed = requireTimestamp(observedAt, "observedAt");
    const identityKey = exactIdentityKey(identity);
    const reusable = [...this.#canonical]
      .reverse()
      .find((entry) => {
        const run = this.#runs.find(
          (candidate) => candidate.owner.runId === entry.runId,
        );
        return (
          entry.identityKey === identityKey &&
          Date.parse(entry.expiresAt) > observed &&
          run?.status === "ready" &&
          entry.analysis.publicationState === "analysis_only"
        );
      });
    return reusable?.analysis ?? null;
  }

  async acquireAnalysisOwner(
    request: AcquireOwnerRequest,
  ): Promise<OwnerAcquisition> {
    validateIdentity(request.identity);
    requireUuid(request.runId, "runId");
    const startedAt = requireTimestamp(request.startedAt, "startedAt");
    const leaseExpiresAt = requireTimestamp(
      request.leaseExpiresAt,
      "leaseExpiresAt",
    );
    if (leaseExpiresAt <= startedAt) {
      throw new PersistenceContractError("lease must expire after it starts");
    }
    const reusable = await this.findReusableCanonicalAnalysis(
      request.identity,
      request.startedAt,
    );
    if (reusable) {
      return { status: "reusable", analysis: reusable };
    }

    const identityKey = exactIdentityKey(request.identity);
    const matchingRuns = this.#runs.filter(
      (candidate) => candidate.identityKey === identityKey,
    );
    const latestTerminal = [...matchingRuns]
      .reverse()
      .find((candidate) => candidate.status === "failed_terminal");
    const processing = [...matchingRuns]
      .reverse()
      .find((candidate) => candidate.status === "processing");
    if (processing && Date.parse(processing.owner.leaseExpiresAt) > startedAt) {
      return { status: "waiting", owner: processing.owner };
    }
    if (processing) {
      processing.status = "failed_retryable";
      processing.safeErrorCode = "ANALYSIS_TEMPORARILY_UNAVAILABLE";
    } else if (latestTerminal?.safeErrorCode) {
      return {
        status: "terminal",
        safeErrorCode: latestTerminal.safeErrorCode,
      };
    }
    if (this.#runIds.has(request.runId)) {
      throw new PersistenceContractError("runId must be globally unique");
    }
    const owner: AnalysisOwner = {
      runId: request.runId,
      attemptNumber: matchingRuns.length + 1,
      leaseExpiresAt: request.leaseExpiresAt,
    };
    this.#runIds.add(request.runId);
    this.#runs.push({
      identityKey,
      owner,
      safeErrorCode: null,
      status: "processing",
    });
    return { status: "owner", owner };
  }

  async waitForReusableCanonicalAnalysis(
    identity: ExactAnalysisIdentity,
    policy: WaitPolicy,
    observedAt: () => string,
    scheduler: WaitScheduler = defaultWaitScheduler,
  ): Promise<WaitResult> {
    validateIdentity(identity);
    validateWaitPolicy(policy);
    const identityKey = exactIdentityKey(identity);
    for (let poll = 0; poll < policy.maxPolls; poll += 1) {
      await scheduler(policy.pollIntervalMs, poll);
      const now = observedAt();
      const reusable = await this.findReusableCanonicalAnalysis(identity, now);
      if (reusable) {
        return { status: "reusable", analysis: reusable };
      }
      const terminal = [...this.#runs]
        .reverse()
        .find(
          (candidate) =>
            candidate.identityKey === identityKey &&
            candidate.status === "failed_terminal",
        );
      if (terminal?.safeErrorCode) {
        return { status: "terminal", safeErrorCode: terminal.safeErrorCode };
      }
    }
    return { status: "busy" };
  }

  async markAnalysisFailure(request: MarkAnalysisFailureRequest): Promise<void> {
    validateIdentity(request.identity);
    requireUuid(request.runId, "runId");
    const finishedAt = requireTimestamp(request.finishedAt, "finishedAt");
    const run = this.#runs.find(
      (candidate) =>
        candidate.identityKey === exactIdentityKey(request.identity) &&
        candidate.owner.runId === request.runId,
    );
    if (
      run?.status !== "processing" ||
      Date.parse(run.owner.leaseExpiresAt) <= finishedAt
    ) {
      throw new StaleAnalysisOwnerError();
    }
    run.status = request.kind === "retryable" ? "failed_retryable" : "failed_terminal";
    run.safeErrorCode = request.safeErrorCode;
  }

  async persistAnalysisOnly(
    request: PersistAnalysisOnlyRequest,
  ): Promise<CanonicalMenuAnalysis> {
    validateIdentity(request.identity);
    requireUuid(request.runId, "runId");
    const persistedAt = requireTimestamp(request.persistedAt, "persistedAt");
    const expiresAt = requireTimestamp(request.expiresAt, "expiresAt");
    if (expiresAt <= persistedAt) {
      throw new PersistenceContractError("expiresAt must follow persistedAt");
    }
    const analysis = CanonicalMenuAnalysisSchema.parse(request.analysis);
    if (analysis.publicationState !== "analysis_only" || analysis.menuVersion !== null) {
      throw new PersistenceContractError(
        "menu-only persistence accepts only analysis_only canonical analyses",
      );
    }
    if (analysis.source.sourceRef !== request.identity.sourceRef) {
      throw new PersistenceContractError("canonical source does not match exact identity");
    }
    const identityKey = exactIdentityKey(request.identity);
    const run = this.#runs.find(
      (candidate) =>
        candidate.identityKey === identityKey &&
        candidate.owner.runId === request.runId,
    );
    if (
      run?.status !== "processing" ||
      Date.parse(run.owner.leaseExpiresAt) <= persistedAt
    ) {
      throw new StaleAnalysisOwnerError();
    }
    if (this.#canonical.some((entry) => entry.analysis.analysisId === analysis.analysisId)) {
      throw new PersistenceContractError("analysisId must be unique");
    }
    this.#canonical.push({
      analysis,
      expiresAt: request.expiresAt,
      identityKey,
      runId: request.runId,
    });
    run.status = "ready";
    run.safeErrorCode = null;
    return analysis;
  }
}
