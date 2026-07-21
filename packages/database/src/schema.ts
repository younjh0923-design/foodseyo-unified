import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "string", withTimezone: true });

export const analysisContracts = pgTable(
  "analysis_contracts",
  {
    id: uuid("id").primaryKey(),
    modelVersion: text("model_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    providerSchemaVersion: text("provider_schema_version").notNull(),
    menuSourceVersion: text("menu_source_version").notNull(),
    restaurantResolutionVersion: text("restaurant_resolution_version").notNull(),
    compactExtractionVersion: text("compact_extraction_version").notNull(),
    analysisSnapshotVersion: text("analysis_snapshot_version").notNull(),
    consistencyVersion: text("consistency_version").notNull(),
    dishKnowledgeVersion: text("dish_knowledge_version").notNull(),
    mergePolicyVersion: text("merge_policy_version").notNull(),
    explanationRendererVersion: text("explanation_renderer_version").notNull(),
    boundaryDtoVersion: text("boundary_dto_version").notNull(),
    moduleInterfaceVersion: text("module_interface_version").notNull(),
    exactCacheKeyVersion: text("exact_cache_key_version").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    unique("analysis_contracts_semantic_vector_uq").on(
      table.modelVersion,
      table.promptVersion,
      table.providerSchemaVersion,
      table.menuSourceVersion,
      table.restaurantResolutionVersion,
      table.compactExtractionVersion,
      table.analysisSnapshotVersion,
      table.consistencyVersion,
      table.dishKnowledgeVersion,
      table.mergePolicyVersion,
      table.explanationRendererVersion,
      table.boundaryDtoVersion,
      table.moduleInterfaceVersion,
      table.exactCacheKeyVersion,
    ),
    check(
      "analysis_contracts_versions_nonblank_ck",
      sql`btrim(${table.modelVersion}) <> ''
        and btrim(${table.promptVersion}) <> ''
        and btrim(${table.providerSchemaVersion}) <> ''
        and btrim(${table.menuSourceVersion}) <> ''
        and btrim(${table.restaurantResolutionVersion}) <> ''
        and btrim(${table.compactExtractionVersion}) <> ''
        and btrim(${table.analysisSnapshotVersion}) <> ''
        and btrim(${table.consistencyVersion}) <> ''
        and btrim(${table.dishKnowledgeVersion}) <> ''
        and btrim(${table.mergePolicyVersion}) <> ''
        and btrim(${table.explanationRendererVersion}) <> ''
        and btrim(${table.boundaryDtoVersion}) <> ''
        and btrim(${table.moduleInterfaceVersion}) <> ''
        and btrim(${table.exactCacheKeyVersion}) <> ''`,
    ),
  ],
);

export const menuEvidenceSets = pgTable(
  "menu_evidence_sets",
  {
    id: uuid("id").primaryKey(),
    sourceRef: uuid("source_ref").notNull(),
    sourceType: text("source_type").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    evidenceIdentityVersion: text("evidence_identity_version").notNull(),
    collectedAt: utcTimestamp("collected_at").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    unique("menu_evidence_sets_source_ref_uq").on(table.sourceRef),
    unique("menu_evidence_sets_exact_identity_uq").on(
      table.sourceFingerprint,
      table.evidenceIdentityVersion,
    ),
    check(
      "menu_evidence_sets_source_type_ck",
      sql`${table.sourceType} in ('uploaded_menu', 'official_website', 'official_pdf', 'ordering_page', 'web_search_discovery')`,
    ),
    check(
      "menu_evidence_sets_identity_nonblank_ck",
      sql`btrim(${table.sourceFingerprint}) <> '' and btrim(${table.evidenceIdentityVersion}) <> ''`,
    ),
  ],
);

export const analysisRuns = pgTable(
  "analysis_runs",
  {
    id: uuid("id").primaryKey(),
    evidenceSetId: uuid("evidence_set_id")
      .notNull()
      .references(() => menuEvidenceSets.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    analysisContractId: uuid("analysis_contract_id")
      .notNull()
      .references(() => analysisContracts.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull(),
    leaseExpiresAt: utcTimestamp("lease_expires_at"),
    startedAt: utcTimestamp("started_at").notNull(),
    finishedAt: utcTimestamp("finished_at"),
    safeErrorCode: text("safe_error_code"),
    createdAt: utcTimestamp("created_at").notNull(),
    updatedAt: utcTimestamp("updated_at").notNull(),
  },
  (table) => [
    unique("analysis_runs_attempt_uq").on(
      table.evidenceSetId,
      table.analysisContractId,
      table.attemptNumber,
    ),
    unique("analysis_runs_owner_identity_uq").on(
      table.id,
      table.evidenceSetId,
      table.analysisContractId,
    ),
    uniqueIndex("analysis_runs_one_processing_uq")
      .on(table.evidenceSetId, table.analysisContractId)
      .where(sql`${table.status} = 'processing'`),
    check("analysis_runs_attempt_positive_ck", sql`${table.attemptNumber} > 0`),
    check(
      "analysis_runs_status_ck",
      sql`${table.status} in ('processing', 'ready', 'failed_retryable', 'failed_terminal')`,
    ),
    check(
      "analysis_runs_state_shape_ck",
      sql`(
          ${table.status} = 'processing'
          and ${table.leaseExpiresAt} is not null
          and ${table.leaseExpiresAt} > ${table.startedAt}
          and ${table.finishedAt} is null
          and ${table.safeErrorCode} is null
        ) or (
          ${table.status} = 'ready'
          and ${table.leaseExpiresAt} is null
          and ${table.finishedAt} is not null
          and ${table.safeErrorCode} is null
        ) or (
          ${table.status} in ('failed_retryable', 'failed_terminal')
          and ${table.leaseExpiresAt} is null
          and ${table.finishedAt} is not null
          and btrim(${table.safeErrorCode}) <> ''
        )`,
    ),
  ],
);

export const canonicalAnalyses = pgTable(
  "canonical_analyses",
  {
    id: uuid("id").primaryKey(),
    evidenceSetId: uuid("evidence_set_id").notNull(),
    analysisContractId: uuid("analysis_contract_id").notNull(),
    producingRunId: uuid("producing_run_id").notNull(),
    publicationState: text("publication_state").notNull(),
    restaurantId: uuid("restaurant_id"),
    restaurantMenuVersionId: uuid("restaurant_menu_version_id"),
    canonicalAnalysisJson: jsonb("canonical_analysis_json")
      .$type<unknown>()
      .notNull(),
    validatedAt: utcTimestamp("validated_at").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
    lastAccessedAt: utcTimestamp("last_accessed_at").notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    invalidatedAt: utcTimestamp("invalidated_at"),
    safeInvalidationCode: text("safe_invalidation_code"),
  },
  (table) => [
    foreignKey({
      columns: [
        table.producingRunId,
        table.evidenceSetId,
        table.analysisContractId,
      ],
      foreignColumns: [
        analysisRuns.id,
        analysisRuns.evidenceSetId,
        analysisRuns.analysisContractId,
      ],
      name: "canonical_analyses_run_identity_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("canonical_analyses_publication_identity_uq").on(
      table.id,
      table.restaurantId,
      table.restaurantMenuVersionId,
    ),
    uniqueIndex("canonical_analyses_active_exact_uq")
      .on(table.evidenceSetId, table.analysisContractId)
      .where(sql`${table.invalidatedAt} is null`),
    check(
      "canonical_analyses_publication_state_ck",
      sql`${table.publicationState} in ('analysis_only', 'eligible')`,
    ),
    check(
      "canonical_analyses_identity_shape_ck",
      sql`(
          ${table.publicationState} = 'analysis_only'
          and ${table.restaurantId} is null
          and ${table.restaurantMenuVersionId} is null
        ) or (
          ${table.publicationState} = 'eligible'
          and ${table.restaurantId} is not null
          and ${table.restaurantMenuVersionId} is not null
        )`,
    ),
    check(
      "canonical_analyses_json_shape_ck",
      sql`jsonb_typeof(${table.canonicalAnalysisJson}) = 'object'
        and ${table.canonicalAnalysisJson} ->> 'analysisId' = ${table.id}::text
        and ${table.canonicalAnalysisJson} ->> 'publicationState' = ${table.publicationState}
        and (
          ${table.publicationState} = 'analysis_only'
          or ${table.canonicalAnalysisJson} #>> '{restaurantResolution,restaurantId}' = ${table.restaurantId}::text
        )
        and (
          ${table.publicationState} = 'analysis_only'
          or ${table.canonicalAnalysisJson} #>> '{menuVersion,menuVersionId}' = ${table.restaurantMenuVersionId}::text
        )`,
    ),
    check(
      "canonical_analyses_lifetime_ck",
      sql`${table.expiresAt} > ${table.createdAt}
        and (
          (${table.invalidatedAt} is null and ${table.safeInvalidationCode} is null)
          or (${table.invalidatedAt} is not null and btrim(${table.safeInvalidationCode}) <> '')
        )`,
    ),
  ],
);

export const restaurants = pgTable(
  "restaurants",
  {
    id: uuid("id").primaryKey(),
    displayName: text("display_name").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
    updatedAt: utcTimestamp("updated_at").notNull(),
  },
  (table) => [
    check("restaurants_display_name_nonblank_ck", sql`btrim(${table.displayName}) <> ''`),
  ],
);

export const restaurantExternalReferences = pgTable(
  "restaurant_external_references",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    unique("restaurant_external_refs_provider_external_uq").on(
      table.provider,
      table.externalId,
    ),
    unique("restaurant_external_refs_restaurant_provider_uq").on(
      table.restaurantId,
      table.provider,
    ),
    check(
      "restaurant_external_refs_provider_ck",
      sql`${table.provider} = 'google_places'`,
    ),
    check(
      "restaurant_external_refs_external_nonblank_ck",
      sql`btrim(${table.externalId}) <> ''`,
    ),
  ],
);

export const restaurantMenuVersions = pgTable(
  "restaurant_menu_versions",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    evidenceSetId: uuid("evidence_set_id")
      .notNull()
      .references(() => menuEvidenceSets.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    menuScope: text("menu_scope").notNull(),
    state: text("state").notNull(),
    versionOrdinal: integer("version_ordinal").notNull(),
    collectedAt: utcTimestamp("collected_at").notNull(),
    validFrom: utcTimestamp("valid_from").notNull(),
    validUntil: utcTimestamp("valid_until"),
    supersedesMenuVersionId: uuid("supersedes_menu_version_id"),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    unique("restaurant_menu_versions_id_restaurant_uq").on(
      table.id,
      table.restaurantId,
    ),
    unique("restaurant_menu_versions_ordinal_uq").on(
      table.restaurantId,
      table.menuScope,
      table.versionOrdinal,
    ),
    uniqueIndex("restaurant_menu_versions_one_active_uq")
      .on(table.restaurantId, table.menuScope)
      .where(sql`${table.state} = 'active'`),
    foreignKey({
      columns: [table.supersedesMenuVersionId, table.restaurantId],
      foreignColumns: [table.id, table.restaurantId],
      name: "restaurant_menu_versions_predecessor_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "restaurant_menu_versions_scope_ck",
      sql`${table.menuScope} in ('default', 'all_day', 'breakfast', 'brunch', 'lunch', 'dinner', 'drinks', 'dessert', 'happy_hour', 'kids', 'late_night', 'seasonal')`,
    ),
    check(
      "restaurant_menu_versions_state_ck",
      sql`${table.state} in ('draft', 'active', 'stale', 'superseded', 'retired')`,
    ),
    check(
      "restaurant_menu_versions_lifetime_ck",
      sql`${table.versionOrdinal} > 0
        and (${table.validUntil} is null or ${table.validUntil} > ${table.validFrom})
        and (${table.supersedesMenuVersionId} is null or ${table.supersedesMenuVersionId} <> ${table.id})`,
    ),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey(),
    restaurantMenuVersionId: uuid("restaurant_menu_version_id").notNull(),
    restaurantId: uuid("restaurant_id").notNull(),
    sectionIndex: integer("section_index").notNull(),
    itemIndex: integer("item_index").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    priceMinorUnits: integer("price_minor_units"),
    priceCurrency: text("price_currency"),
    optionTexts: text("option_texts").array().notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.restaurantMenuVersionId, table.restaurantId],
      foreignColumns: [restaurantMenuVersions.id, restaurantMenuVersions.restaurantId],
      name: "menu_items_menu_restaurant_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("menu_items_position_uq").on(
      table.restaurantMenuVersionId,
      table.sectionIndex,
      table.itemIndex,
    ),
    check(
      "menu_items_shape_ck",
      sql`${table.sectionIndex} >= 0
        and ${table.itemIndex} >= 0
        and btrim(${table.name}) <> ''
        and (${table.description} is null or btrim(${table.description}) <> '')
        and (
          (${table.priceMinorUnits} is null and ${table.priceCurrency} is null)
          or (
            ${table.priceMinorUnits} >= 0
            and ${table.priceCurrency} ~ '^[A-Z]{3}$'
          )
        )
        and array_position(${table.optionTexts}, null) is null
        and array_position(${table.optionTexts}, '') is null`,
    ),
  ],
);

export const dishes = pgTable(
  "dishes",
  {
    id: uuid("id").primaryKey(),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
    updatedAt: utcTimestamp("updated_at").notNull(),
  },
  (table) => [
    index("dishes_display_name_idx").on(table.displayName),
    index("dishes_normalized_name_idx").on(table.normalizedName),
    check(
      "dishes_names_nonblank_ck",
      sql`btrim(${table.displayName}) <> '' and btrim(${table.normalizedName}) <> ''`,
    ),
  ],
);

export const menuItemDishMatches = pgTable(
  "menu_item_dish_matches",
  {
    id: uuid("id").primaryKey(),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    dishCandidateId: uuid("dish_candidate_id").notNull(),
    dishId: uuid("dish_id").references(() => dishes.id, {
      onDelete: "restrict",
      onUpdate: "restrict",
    }),
    state: text("state").notNull(),
    decisionKind: text("decision_kind"),
    reviewerRef: uuid("reviewer_ref"),
    ruleVersion: text("rule_version"),
    decidedAt: utcTimestamp("decided_at"),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    unique("menu_item_dish_matches_candidate_uq").on(
      table.menuItemId,
      table.dishCandidateId,
    ),
    check(
      "menu_item_dish_matches_state_ck",
      sql`${table.state} in ('candidate', 'matched', 'rejected', 'unresolved')`,
    ),
    check(
      "menu_item_dish_matches_decision_kind_ck",
      sql`${table.decisionKind} is null or ${table.decisionKind} in ('human_reviewed', 'deterministic_rule')`,
    ),
    check(
      "menu_item_dish_matches_shape_ck",
      sql`(
          ${table.state} = 'matched'
          and ${table.dishId} is not null
          and ${table.decisionKind} is not null
        ) or (
          ${table.state} = 'rejected'
          and ${table.dishId} is null
          and ${table.decisionKind} is not null
        ) or (
          ${table.state} in ('candidate', 'unresolved')
          and ${table.dishId} is null
          and ${table.decisionKind} is null
        )`,
    ),
    check(
      "menu_item_dish_matches_decision_shape_ck",
      sql`(
          ${table.decisionKind} is null
          and ${table.reviewerRef} is null
          and ${table.ruleVersion} is null
          and ${table.decidedAt} is null
        ) or (
          ${table.decisionKind} = 'human_reviewed'
          and ${table.reviewerRef} is not null
          and ${table.ruleVersion} is null
          and ${table.decidedAt} is not null
        ) or (
          ${table.decisionKind} = 'deterministic_rule'
          and ${table.reviewerRef} is null
          and btrim(${table.ruleVersion}) <> ''
          and ${table.decidedAt} is not null
        )`,
    ),
  ],
);

export const publicationReceipts = pgTable(
  "publication_receipts",
  {
    analysisId: uuid("analysis_id").primaryKey(),
    restaurantId: uuid("restaurant_id").notNull(),
    restaurantMenuVersionId: uuid("restaurant_menu_version_id").notNull(),
    operationId: uuid("operation_id").notNull(),
    contractVersion: text("contract_version").notNull(),
    status: text("status").notNull(),
    publishedAt: utcTimestamp("published_at").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    unique("publication_receipts_operation_uq").on(table.operationId),
    foreignKey({
      columns: [
        table.analysisId,
        table.restaurantId,
        table.restaurantMenuVersionId,
      ],
      foreignColumns: [
        canonicalAnalyses.id,
        canonicalAnalyses.restaurantId,
        canonicalAnalyses.restaurantMenuVersionId,
      ],
      name: "publication_receipts_analysis_identity_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.restaurantMenuVersionId, table.restaurantId],
      foreignColumns: [restaurantMenuVersions.id, restaurantMenuVersions.restaurantId],
      name: "publication_receipts_menu_restaurant_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "publication_receipts_contract_version_ck",
      sql`${table.contractVersion} = 'module-interfaces/1.0.0'`,
    ),
    check("publication_receipts_status_ck", sql`${table.status} = 'published'`),
  ],
);

export const MVP_PERSISTENCE_TABLES = [
  analysisContracts,
  menuEvidenceSets,
  analysisRuns,
  canonicalAnalyses,
  restaurants,
  restaurantExternalReferences,
  restaurantMenuVersions,
  menuItems,
  dishes,
  menuItemDishMatches,
  publicationReceipts,
] as const;
