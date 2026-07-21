import {
  CanonicalMenuAnalysisSchema,
  MODULE_INTERFACE_VERSION,
  PublicationEligibleAnalysisSchema,
  PublicationReceiptSchema,
  isPublicationEligibleAnalysis,
  type CanonicalMenuAnalysis,
  type MenuSourceType,
  type PublicationEligibleAnalysis,
  type PublicationReceipt,
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

export type PublicationFaultPoint =
  | "after_commit_response_loss"
  | "before_canonical_analysis"
  | "before_receipt"
  | "while_writing_menu_items";

export interface PublishEligibleAnalysisRequest {
  readonly identity: ExactAnalysisIdentity;
  readonly runId: string;
  readonly operationId: string;
  readonly externalReferenceId: string;
  readonly googlePlaceId: string;
  readonly reservedRestaurantId: string;
  readonly restaurantDisplayName: string;
  readonly persistedAt: string;
  readonly expiresAt: string;
  readonly faultPoint?: PublicationFaultPoint;
  readonly buildAnalysis: (
    restaurantId: string,
  ) => Promise<PublicationEligibleAnalysis> | PublicationEligibleAnalysis;
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
  findRestaurantByExternalReference(
    googlePlaceId: string,
  ): Promise<string | null>;
  publishEligibleAnalysis(
    request: PublishEligibleAnalysisRequest,
  ): Promise<PublicationReceipt>;
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

export class InjectedPublicationFailure extends Error {
  constructor(readonly point: PublicationFaultPoint) {
    super(`injected publication failure at ${point}`);
    this.name = "InjectedPublicationFailure";
  }
}

class RestaurantConvergenceConflict extends Error {
  constructor(readonly committedRestaurantId: string) {
    super("Google Place ID was concurrently bound to another restaurant");
    this.name = "RestaurantConvergenceConflict";
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

interface PublicationReceiptRow extends QueryResultRow {
  readonly analysis_id: string;
  readonly contract_version: string;
  readonly published_at: Date | string;
  readonly restaurant_menu_version_id: string;
  readonly status: string;
}

const projectPublicationReceipt = (
  row: PublicationReceiptRow,
): PublicationReceipt =>
  PublicationReceiptSchema.parse({
    contractVersion: row.contract_version,
    analysisId: row.analysis_id,
    menuVersionId: row.restaurant_menu_version_id,
    status: row.status,
    publishedAt:
      row.published_at instanceof Date
        ? row.published_at.toISOString()
        : row.published_at,
  });

const validateEligiblePublication = (
  request: PublishEligibleAnalysisRequest,
  restaurantId: string,
  value: PublicationEligibleAnalysis,
): PublicationEligibleAnalysis => {
  validateIdentity(request.identity);
  requireUuid(request.runId, "runId");
  requireUuid(request.operationId, "operationId");
  requireUuid(request.externalReferenceId, "externalReferenceId");
  requireUuid(request.reservedRestaurantId, "reservedRestaurantId");
  requireUuid(restaurantId, "restaurantId");
  requireNonblank(request.googlePlaceId, "googlePlaceId");
  requireNonblank(request.restaurantDisplayName, "restaurantDisplayName");
  const persistedAt = requireTimestamp(request.persistedAt, "persistedAt");
  const expiresAt = requireTimestamp(request.expiresAt, "expiresAt");
  if (expiresAt <= persistedAt) {
    throw new PersistenceContractError("expiresAt must follow persistedAt");
  }
  const analysis = PublicationEligibleAnalysisSchema.parse(value);
  if (!isPublicationEligibleAnalysis(analysis)) {
    throw new PersistenceContractError("eligible publication requires menuVersion");
  }
  if (
    analysis.restaurantResolution.restaurantId !== restaurantId ||
    analysis.menuVersion.restaurantId !== restaurantId
  ) {
    throw new PersistenceContractError(
      "canonical and relational restaurant identities must match",
    );
  }
  if (analysis.restaurantResolution.selectedCandidateId === restaurantId) {
    throw new PersistenceContractError(
      "request-scoped candidateId cannot become Restaurant.id",
    );
  }
  const selectedCandidate = analysis.restaurantResolution.candidates.find(
    (candidate) =>
      candidate.candidateId === analysis.restaurantResolution.selectedCandidateId,
  );
  if (selectedCandidate?.googlePlaceId !== request.googlePlaceId) {
    throw new PersistenceContractError(
      "canonical restaurant resolution does not match Google Place ID",
    );
  }
  if (
    analysis.source.sourceRef !== request.identity.sourceRef ||
    !analysis.menuVersion.sourceRefs.includes(request.identity.sourceRef)
  ) {
    throw new PersistenceContractError(
      "eligible canonical source does not match exact evidence identity",
    );
  }
  if (analysis.menuVersion.state !== "active") {
    throw new PersistenceContractError("published menu version must be active");
  }
  return analysis;
};

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

  async findRestaurantByExternalReference(
    googlePlaceId: string,
  ): Promise<string | null> {
    requireNonblank(googlePlaceId, "googlePlaceId");
    const result = await this.sql.query<{ readonly restaurant_id: string }>(
      `select restaurant_id
         from restaurant_external_references
        where provider = 'google_places' and external_id = $1
        limit 1`,
      [googlePlaceId],
    );
    return result.rows[0]?.restaurant_id ?? null;
  }

  async #findPublicationReceipt(
    analysisId: string,
  ): Promise<PublicationReceipt | null> {
    const result = await this.sql.query<PublicationReceiptRow>(
      `select analysis_id, restaurant_menu_version_id, contract_version,
              status, published_at
         from publication_receipts
        where analysis_id = $1
        limit 1`,
      [analysisId],
    );
    return result.rows[0] ? projectPublicationReceipt(result.rows[0]) : null;
  }

  async publishEligibleAnalysis(
    request: PublishEligibleAnalysisRequest,
  ): Promise<PublicationReceipt> {
    let restaurantId =
      (await this.findRestaurantByExternalReference(request.googlePlaceId)) ??
      request.reservedRestaurantId;

    for (let convergenceAttempt = 0; convergenceAttempt < 2; convergenceAttempt += 1) {
      const analysis = validateEligiblePublication(
        request,
        restaurantId,
        await request.buildAnalysis(restaurantId),
      );
      try {
        const receipt = await this.#publishEligibleAttempt(
          request,
          restaurantId,
          analysis,
        );
        if (request.faultPoint === "after_commit_response_loss") {
          const recovered = await this.#findPublicationReceipt(receipt.analysisId);
          if (!recovered) {
            throw new PersistenceContractError(
              "committed publication receipt could not be recovered",
            );
          }
          return recovered;
        }
        return receipt;
      } catch (error) {
        if (error instanceof RestaurantConvergenceConflict) {
          restaurantId = error.committedRestaurantId;
          continue;
        }
        throw error;
      }
    }
    throw new PersistenceContractError("restaurant convergence retry was exhausted");
  }

  async #publishEligibleAttempt(
    request: PublishEligibleAnalysisRequest,
    restaurantId: string,
    analysis: PublicationEligibleAnalysis,
  ): Promise<PublicationReceipt> {
    return this.sql.transaction(async (executor) => {
      const existingReceipt = await executor.query<PublicationReceiptRow>(
        `select analysis_id, restaurant_menu_version_id, contract_version,
                status, published_at
           from publication_receipts
          where analysis_id = $1
          limit 1`,
        [analysis.analysisId],
      );
      if (existingReceipt.rows[0]) {
        return projectPublicationReceipt(existingReceipt.rows[0]);
      }

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

      const external = await executor.query<{ readonly restaurant_id: string }>(
        `select restaurant_id
           from restaurant_external_references
          where provider = 'google_places' and external_id = $1
          limit 1`,
        [request.googlePlaceId],
      );
      const committedRestaurantId = external.rows[0]?.restaurant_id;
      if (committedRestaurantId && committedRestaurantId !== restaurantId) {
        throw new RestaurantConvergenceConflict(committedRestaurantId);
      }
      if (!committedRestaurantId) {
        await executor.query(
          `insert into restaurants (id, display_name, created_at, updated_at)
           values ($1, $2, $3, $3)
           on conflict (id) do nothing`,
          [restaurantId, request.restaurantDisplayName, request.persistedAt],
        );
        const insertedReference = await executor.query<{
          readonly restaurant_id: string;
        }>(
          `insert into restaurant_external_references (
            id, restaurant_id, provider, external_id, created_at
          ) values ($1, $2, 'google_places', $3, $4)
          on conflict (provider, external_id) do nothing
          returning restaurant_id`,
          [
            request.externalReferenceId,
            restaurantId,
            request.googlePlaceId,
            request.persistedAt,
          ],
        );
        if (!insertedReference.rows[0]) {
          const winner = await executor.query<{ readonly restaurant_id: string }>(
            `select restaurant_id
               from restaurant_external_references
              where provider = 'google_places' and external_id = $1
              limit 1`,
            [request.googlePlaceId],
          );
          const winnerId = winner.rows[0]?.restaurant_id;
          if (!winnerId) {
            throw new PersistenceContractError(
              "Google Place ID convergence winner was not visible",
            );
          }
          if (winnerId !== restaurantId) {
            throw new RestaurantConvergenceConflict(winnerId);
          }
        }
      }

      if (request.faultPoint === "before_canonical_analysis") {
        throw new InjectedPublicationFailure(request.faultPoint);
      }

      await executor.query(
        `insert into canonical_analyses (
          id, evidence_set_id, analysis_contract_id, producing_run_id,
          publication_state, restaurant_id, restaurant_menu_version_id,
          canonical_analysis_json, validated_at, created_at, last_accessed_at,
          expires_at, invalidated_at, safe_invalidation_code
        ) values ($1, $2, $3, $4, 'eligible', $5, $6, $7::jsonb,
                  $8, $9, $9, $10, null, null)`,
        [
          analysis.analysisId,
          request.identity.evidenceSetId,
          request.identity.analysisContractId,
          request.runId,
          restaurantId,
          analysis.menuVersion.menuVersionId,
          JSON.stringify(analysis),
          analysis.validatedAt,
          request.persistedAt,
          request.expiresAt,
        ],
      );

      const activeVersion = await executor.query<{
        readonly id: string;
        readonly version_ordinal: number;
      }>(
        `select id, version_ordinal
           from restaurant_menu_versions
          where restaurant_id = $1 and menu_scope = $2 and state = 'active'
          for update`,
        [restaurantId, analysis.menuVersion.menuScope],
      );
      const predecessor = activeVersion.rows[0];
      if (predecessor) {
        if (
          analysis.menuVersion.supersedesMenuVersionId !== predecessor.id ||
          analysis.menuVersion.versionOrdinal !== predecessor.version_ordinal + 1
        ) {
          throw new PersistenceContractError(
            "new active menu must explicitly supersede the current active version",
          );
        }
        await executor.query(
          `update restaurant_menu_versions
              set state = 'superseded', valid_until = $2
            where id = $1 and state = 'active'`,
          [predecessor.id, analysis.menuVersion.validFrom],
        );
      }
      await executor.query(
        `insert into restaurant_menu_versions (
          id, restaurant_id, evidence_set_id, menu_scope, state,
          version_ordinal, collected_at, valid_from, valid_until,
          supersedes_menu_version_id, created_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          analysis.menuVersion.menuVersionId,
          restaurantId,
          request.identity.evidenceSetId,
          analysis.menuVersion.menuScope,
          analysis.menuVersion.state,
          analysis.menuVersion.versionOrdinal,
          analysis.menuVersion.collectedAt,
          analysis.menuVersion.validFrom,
          analysis.menuVersion.validUntil,
          analysis.menuVersion.supersedesMenuVersionId,
          request.persistedAt,
        ],
      );

      if (request.faultPoint === "while_writing_menu_items") {
        throw new InjectedPublicationFailure(request.faultPoint);
      }
      for (const item of analysis.menuItems) {
        await executor.query(
          `insert into menu_items (
            id, restaurant_menu_version_id, restaurant_id, section_index,
            item_index, name, description, price_minor_units, price_currency,
            option_texts, created_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            item.menuItemId,
            analysis.menuVersion.menuVersionId,
            restaurantId,
            item.sectionIndex,
            item.itemIndex,
            item.name,
            item.description,
            item.price?.amountMinor ?? null,
            item.price?.currency ?? null,
            [...item.optionTexts],
            request.persistedAt,
          ],
        );
      }
      for (const candidate of analysis.dishCandidates) {
        if (candidate.dishId) {
          await executor.query(
            `insert into dishes (
              id, display_name, normalized_name, created_at, updated_at
            ) values ($1, $2, $3, $4, $4)
            on conflict (id) do nothing`,
            [
              candidate.dishId,
              candidate.displayName,
              candidate.normalizedName,
              request.persistedAt,
            ],
          );
        }
      }
      for (const match of analysis.dishMatches) {
        await executor.query(
          `insert into menu_item_dish_matches (
            id, menu_item_id, dish_candidate_id, dish_id, state,
            decision_kind, reviewer_ref, rule_version, decided_at, created_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            match.matchId,
            match.menuItemId,
            match.dishCandidateId,
            match.dishId,
            match.state,
            match.decision?.kind ?? null,
            match.decision?.reviewerRef ?? null,
            match.decision?.ruleVersion ?? null,
            match.decision?.decidedAt ?? null,
            request.persistedAt,
          ],
        );
      }

      if (request.faultPoint === "before_receipt") {
        throw new InjectedPublicationFailure(request.faultPoint);
      }
      const receiptRow = await executor.query<PublicationReceiptRow>(
        `insert into publication_receipts (
          analysis_id, restaurant_id, restaurant_menu_version_id, operation_id,
          contract_version, status, published_at, created_at
        ) values ($1, $2, $3, $4, $5, 'published', $6, $6)
        returning analysis_id, restaurant_menu_version_id, contract_version,
                  status, published_at`,
        [
          analysis.analysisId,
          restaurantId,
          analysis.menuVersion.menuVersionId,
          request.operationId,
          MODULE_INTERFACE_VERSION,
          request.persistedAt,
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
      if (ready.rowCount !== 1 || !receiptRow.rows[0]) {
        throw new StaleAnalysisOwnerError();
      }
      return projectPublicationReceipt(receiptRow.rows[0]);
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

interface MemoryMenuVersion {
  readonly id: string;
  readonly menuScope: string;
  readonly restaurantId: string;
  readonly versionOrdinal: number;
  state: string;
  validUntil: string | null;
}

export interface DeterministicConcurrentWinner {
  readonly googlePlaceId: string;
  readonly restaurantDisplayName: string;
  readonly restaurantId: string;
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
  readonly #restaurants = new Map<string, string>();
  readonly #externalReferences = new Map<string, string>();
  readonly #menuVersions = new Map<string, MemoryMenuVersion>();
  readonly #menuItems = new Set<string>();
  readonly #dishes = new Set<string>();
  readonly #matches = new Set<string>();
  readonly #receipts = new Map<string, PublicationReceipt>();
  #concurrentWinnerInjected = false;

  constructor(
    private readonly concurrentWinner: DeterministicConcurrentWinner | null = null,
  ) {}

  snapshotCounts(): DeterministicPersistenceCounts {
    return {
      analysisContracts: this.#contracts.size,
      analysisRuns: this.#runs.length,
      canonicalAnalyses: this.#canonical.length,
      dishes: this.#dishes.size,
      menuEvidenceSets: this.#evidence.size,
      menuItemDishMatches: this.#matches.size,
      menuItems: this.#menuItems.size,
      publicationReceipts: this.#receipts.size,
      restaurantExternalReferences: this.#externalReferences.size,
      restaurantMenuVersions: this.#menuVersions.size,
      restaurants: this.#restaurants.size,
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
          (entry.analysis.publicationState === "analysis_only" ||
            this.#receipts.has(entry.analysis.analysisId))
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

  findRestaurantByExternalReference(
    googlePlaceId: string,
  ): Promise<string | null> {
    requireNonblank(googlePlaceId, "googlePlaceId");
    return Promise.resolve(this.#externalReferences.get(googlePlaceId) ?? null);
  }

  async publishEligibleAnalysis(
    request: PublishEligibleAnalysisRequest,
  ): Promise<PublicationReceipt> {
    let restaurantId =
      (await this.findRestaurantByExternalReference(request.googlePlaceId)) ??
      request.reservedRestaurantId;

    for (let convergenceAttempt = 0; convergenceAttempt < 2; convergenceAttempt += 1) {
      const analysis = validateEligiblePublication(
        request,
        restaurantId,
        await request.buildAnalysis(restaurantId),
      );
      if (
        !this.#concurrentWinnerInjected &&
        this.concurrentWinner?.googlePlaceId === request.googlePlaceId &&
        !this.#externalReferences.has(request.googlePlaceId)
      ) {
        this.#restaurants.set(
          this.concurrentWinner.restaurantId,
          this.concurrentWinner.restaurantDisplayName,
        );
        this.#externalReferences.set(
          this.concurrentWinner.googlePlaceId,
          this.concurrentWinner.restaurantId,
        );
        this.#concurrentWinnerInjected = true;
        restaurantId = this.concurrentWinner.restaurantId;
        continue;
      }
      const existingReceipt = this.#receipts.get(analysis.analysisId);
      if (existingReceipt) {
        return PublicationReceiptSchema.parse(existingReceipt);
      }
      const committedRestaurantId = this.#externalReferences.get(
        request.googlePlaceId,
      );
      if (committedRestaurantId && committedRestaurantId !== restaurantId) {
        restaurantId = committedRestaurantId;
        continue;
      }

      const identityKey = exactIdentityKey(request.identity);
      const run = this.#runs.find(
        (candidate) =>
          candidate.identityKey === identityKey &&
          candidate.owner.runId === request.runId,
      );
      if (
        run?.status !== "processing" ||
        Date.parse(run.owner.leaseExpiresAt) <= Date.parse(request.persistedAt)
      ) {
        throw new StaleAnalysisOwnerError();
      }
      if (this.#canonical.some((entry) => entry.analysis.analysisId === analysis.analysisId)) {
        throw new PersistenceContractError("analysisId must be unique");
      }

      const activeVersion = [...this.#menuVersions.values()].find(
        (version) =>
          version.restaurantId === restaurantId &&
          version.menuScope === analysis.menuVersion.menuScope &&
          version.state === "active",
      );
      if (
        activeVersion &&
        (analysis.menuVersion.supersedesMenuVersionId !== activeVersion.id ||
          analysis.menuVersion.versionOrdinal !== activeVersion.versionOrdinal + 1)
      ) {
        throw new PersistenceContractError(
          "new active menu must explicitly supersede the current active version",
        );
      }
      if (request.faultPoint === "before_canonical_analysis") {
        throw new InjectedPublicationFailure(request.faultPoint);
      }
      if (request.faultPoint === "while_writing_menu_items") {
        throw new InjectedPublicationFailure(request.faultPoint);
      }
      if (request.faultPoint === "before_receipt") {
        throw new InjectedPublicationFailure(request.faultPoint);
      }

      const receipt = PublicationReceiptSchema.parse({
        contractVersion: MODULE_INTERFACE_VERSION,
        analysisId: analysis.analysisId,
        menuVersionId: analysis.menuVersion.menuVersionId,
        status: "published",
        publishedAt: request.persistedAt,
      });

      if (!committedRestaurantId) {
        this.#restaurants.set(restaurantId, request.restaurantDisplayName);
        this.#externalReferences.set(request.googlePlaceId, restaurantId);
      }
      if (activeVersion) {
        activeVersion.state = "superseded";
        activeVersion.validUntil = analysis.menuVersion.validFrom;
      }
      this.#menuVersions.set(analysis.menuVersion.menuVersionId, {
        id: analysis.menuVersion.menuVersionId,
        menuScope: analysis.menuVersion.menuScope,
        restaurantId,
        state: analysis.menuVersion.state,
        validUntil: analysis.menuVersion.validUntil,
        versionOrdinal: analysis.menuVersion.versionOrdinal,
      });
      for (const item of analysis.menuItems) {
        this.#menuItems.add(item.menuItemId);
      }
      for (const candidate of analysis.dishCandidates) {
        if (candidate.dishId) {
          this.#dishes.add(candidate.dishId);
        }
      }
      for (const match of analysis.dishMatches) {
        this.#matches.add(match.matchId);
      }
      this.#canonical.push({
        analysis,
        expiresAt: request.expiresAt,
        identityKey,
        runId: request.runId,
      });
      this.#receipts.set(analysis.analysisId, receipt);
      run.status = "ready";
      run.safeErrorCode = null;

      if (request.faultPoint === "after_commit_response_loss") {
        const recovered = this.#receipts.get(analysis.analysisId);
        if (!recovered) {
          throw new PersistenceContractError(
            "committed publication receipt could not be recovered",
          );
        }
        return PublicationReceiptSchema.parse(recovered);
      }
      return receipt;
    }
    throw new PersistenceContractError("restaurant convergence retry was exhausted");
  }
}
