CREATE TABLE "analysis_contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"model_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provider_schema_version" text NOT NULL,
	"menu_source_version" text NOT NULL,
	"restaurant_resolution_version" text NOT NULL,
	"compact_extraction_version" text NOT NULL,
	"analysis_snapshot_version" text NOT NULL,
	"consistency_version" text NOT NULL,
	"dish_knowledge_version" text NOT NULL,
	"merge_policy_version" text NOT NULL,
	"explanation_renderer_version" text NOT NULL,
	"boundary_dto_version" text NOT NULL,
	"module_interface_version" text NOT NULL,
	"exact_cache_key_version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "analysis_contracts_semantic_vector_uq" UNIQUE("model_version","prompt_version","provider_schema_version","menu_source_version","restaurant_resolution_version","compact_extraction_version","analysis_snapshot_version","consistency_version","dish_knowledge_version","merge_policy_version","explanation_renderer_version","boundary_dto_version","module_interface_version","exact_cache_key_version"),
	CONSTRAINT "analysis_contracts_versions_nonblank_ck" CHECK (btrim("analysis_contracts"."model_version") <> ''
        and btrim("analysis_contracts"."prompt_version") <> ''
        and btrim("analysis_contracts"."provider_schema_version") <> ''
        and btrim("analysis_contracts"."menu_source_version") <> ''
        and btrim("analysis_contracts"."restaurant_resolution_version") <> ''
        and btrim("analysis_contracts"."compact_extraction_version") <> ''
        and btrim("analysis_contracts"."analysis_snapshot_version") <> ''
        and btrim("analysis_contracts"."consistency_version") <> ''
        and btrim("analysis_contracts"."dish_knowledge_version") <> ''
        and btrim("analysis_contracts"."merge_policy_version") <> ''
        and btrim("analysis_contracts"."explanation_renderer_version") <> ''
        and btrim("analysis_contracts"."boundary_dto_version") <> ''
        and btrim("analysis_contracts"."module_interface_version") <> ''
        and btrim("analysis_contracts"."exact_cache_key_version") <> '')
);
--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evidence_set_id" uuid NOT NULL,
	"analysis_contract_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"safe_error_code" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "analysis_runs_attempt_uq" UNIQUE("evidence_set_id","analysis_contract_id","attempt_number"),
	CONSTRAINT "analysis_runs_owner_identity_uq" UNIQUE("id","evidence_set_id","analysis_contract_id"),
	CONSTRAINT "analysis_runs_attempt_positive_ck" CHECK ("analysis_runs"."attempt_number" > 0),
	CONSTRAINT "analysis_runs_status_ck" CHECK ("analysis_runs"."status" in ('processing', 'ready', 'failed_retryable', 'failed_terminal')),
	CONSTRAINT "analysis_runs_state_shape_ck" CHECK ((
          "analysis_runs"."status" = 'processing'
          and "analysis_runs"."lease_expires_at" is not null
          and "analysis_runs"."lease_expires_at" > "analysis_runs"."started_at"
          and "analysis_runs"."finished_at" is null
          and "analysis_runs"."safe_error_code" is null
        ) or (
          "analysis_runs"."status" = 'ready'
          and "analysis_runs"."lease_expires_at" is null
          and "analysis_runs"."finished_at" is not null
          and "analysis_runs"."safe_error_code" is null
        ) or (
          "analysis_runs"."status" in ('failed_retryable', 'failed_terminal')
          and "analysis_runs"."lease_expires_at" is null
          and "analysis_runs"."finished_at" is not null
          and btrim("analysis_runs"."safe_error_code") <> ''
        ))
);
--> statement-breakpoint
CREATE TABLE "canonical_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evidence_set_id" uuid NOT NULL,
	"analysis_contract_id" uuid NOT NULL,
	"producing_run_id" uuid NOT NULL,
	"publication_state" text NOT NULL,
	"restaurant_id" uuid,
	"restaurant_menu_version_id" uuid,
	"canonical_analysis_json" jsonb NOT NULL,
	"validated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_accessed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invalidated_at" timestamp with time zone,
	"safe_invalidation_code" text,
	CONSTRAINT "canonical_analyses_publication_identity_uq" UNIQUE("id","restaurant_id","restaurant_menu_version_id"),
	CONSTRAINT "canonical_analyses_publication_state_ck" CHECK ("canonical_analyses"."publication_state" in ('analysis_only', 'eligible')),
	CONSTRAINT "canonical_analyses_identity_shape_ck" CHECK ((
          "canonical_analyses"."publication_state" = 'analysis_only'
          and "canonical_analyses"."restaurant_id" is null
          and "canonical_analyses"."restaurant_menu_version_id" is null
        ) or (
          "canonical_analyses"."publication_state" = 'eligible'
          and "canonical_analyses"."restaurant_id" is not null
          and "canonical_analyses"."restaurant_menu_version_id" is not null
        )),
	CONSTRAINT "canonical_analyses_json_shape_ck" CHECK (jsonb_typeof("canonical_analyses"."canonical_analysis_json") = 'object'
        and "canonical_analyses"."canonical_analysis_json" ->> 'analysisId' = "canonical_analyses"."id"::text
        and "canonical_analyses"."canonical_analysis_json" ->> 'publicationState' = "canonical_analyses"."publication_state"
        and (
          "canonical_analyses"."publication_state" = 'analysis_only'
          or "canonical_analyses"."canonical_analysis_json" #>> '{restaurantResolution,restaurantId}' = "canonical_analyses"."restaurant_id"::text
        )
        and (
          "canonical_analyses"."publication_state" = 'analysis_only'
          or "canonical_analyses"."canonical_analysis_json" #>> '{menuVersion,menuVersionId}' = "canonical_analyses"."restaurant_menu_version_id"::text
        )),
	CONSTRAINT "canonical_analyses_lifetime_ck" CHECK ("canonical_analyses"."expires_at" > "canonical_analyses"."created_at"
        and (
          ("canonical_analyses"."invalidated_at" is null and "canonical_analyses"."safe_invalidation_code" is null)
          or ("canonical_analyses"."invalidated_at" is not null and btrim("canonical_analyses"."safe_invalidation_code") <> '')
        ))
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dishes_names_nonblank_ck" CHECK (btrim("dishes"."display_name") <> '' and btrim("dishes"."normalized_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "menu_evidence_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_ref" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"evidence_identity_version" text NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "menu_evidence_sets_source_ref_uq" UNIQUE("source_ref"),
	CONSTRAINT "menu_evidence_sets_exact_identity_uq" UNIQUE("source_fingerprint","evidence_identity_version"),
	CONSTRAINT "menu_evidence_sets_source_type_ck" CHECK ("menu_evidence_sets"."source_type" in ('uploaded_menu', 'official_website', 'official_pdf', 'ordering_page', 'web_search_discovery')),
	CONSTRAINT "menu_evidence_sets_identity_nonblank_ck" CHECK (btrim("menu_evidence_sets"."source_fingerprint") <> '' and btrim("menu_evidence_sets"."evidence_identity_version") <> '')
);
--> statement-breakpoint
CREATE TABLE "menu_item_dish_matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"dish_candidate_id" uuid NOT NULL,
	"dish_id" uuid,
	"state" text NOT NULL,
	"decision_kind" text,
	"reviewer_ref" uuid,
	"rule_version" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "menu_item_dish_matches_candidate_uq" UNIQUE("menu_item_id","dish_candidate_id"),
	CONSTRAINT "menu_item_dish_matches_state_ck" CHECK ("menu_item_dish_matches"."state" in ('candidate', 'matched', 'rejected', 'unresolved')),
	CONSTRAINT "menu_item_dish_matches_decision_kind_ck" CHECK ("menu_item_dish_matches"."decision_kind" is null or "menu_item_dish_matches"."decision_kind" in ('human_reviewed', 'deterministic_rule')),
	CONSTRAINT "menu_item_dish_matches_shape_ck" CHECK ((
          "menu_item_dish_matches"."state" = 'matched'
          and "menu_item_dish_matches"."dish_id" is not null
          and "menu_item_dish_matches"."decision_kind" is not null
        ) or (
          "menu_item_dish_matches"."state" = 'rejected'
          and "menu_item_dish_matches"."dish_id" is null
          and "menu_item_dish_matches"."decision_kind" is not null
        ) or (
          "menu_item_dish_matches"."state" in ('candidate', 'unresolved')
          and "menu_item_dish_matches"."dish_id" is null
          and "menu_item_dish_matches"."decision_kind" is null
        )),
	CONSTRAINT "menu_item_dish_matches_decision_shape_ck" CHECK ((
          "menu_item_dish_matches"."decision_kind" is null
          and "menu_item_dish_matches"."reviewer_ref" is null
          and "menu_item_dish_matches"."rule_version" is null
          and "menu_item_dish_matches"."decided_at" is null
        ) or (
          "menu_item_dish_matches"."decision_kind" = 'human_reviewed'
          and "menu_item_dish_matches"."reviewer_ref" is not null
          and "menu_item_dish_matches"."rule_version" is null
          and "menu_item_dish_matches"."decided_at" is not null
        ) or (
          "menu_item_dish_matches"."decision_kind" = 'deterministic_rule'
          and "menu_item_dish_matches"."reviewer_ref" is null
          and btrim("menu_item_dish_matches"."rule_version") <> ''
          and "menu_item_dish_matches"."decided_at" is not null
        ))
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_menu_version_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"section_index" integer NOT NULL,
	"item_index" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_minor_units" integer,
	"price_currency" text,
	"option_texts" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "menu_items_position_uq" UNIQUE("restaurant_menu_version_id","section_index","item_index"),
	CONSTRAINT "menu_items_shape_ck" CHECK ("menu_items"."section_index" >= 0
        and "menu_items"."item_index" >= 0
        and btrim("menu_items"."name") <> ''
        and ("menu_items"."description" is null or btrim("menu_items"."description") <> '')
        and (
          ("menu_items"."price_minor_units" is null and "menu_items"."price_currency" is null)
          or (
            "menu_items"."price_minor_units" >= 0
            and "menu_items"."price_currency" ~ '^[A-Z]{3}$'
          )
        )
        and array_position("menu_items"."option_texts", null) is null
        and array_position("menu_items"."option_texts", '') is null)
);
--> statement-breakpoint
CREATE TABLE "publication_receipts" (
	"analysis_id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"restaurant_menu_version_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"contract_version" text NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "publication_receipts_operation_uq" UNIQUE("operation_id"),
	CONSTRAINT "publication_receipts_contract_version_ck" CHECK ("publication_receipts"."contract_version" = 'module-interfaces/1.0.0'),
	CONSTRAINT "publication_receipts_status_ck" CHECK ("publication_receipts"."status" = 'published')
);
--> statement-breakpoint
CREATE TABLE "restaurant_external_references" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "restaurant_external_refs_provider_external_uq" UNIQUE("provider","external_id"),
	CONSTRAINT "restaurant_external_refs_restaurant_provider_uq" UNIQUE("restaurant_id","provider"),
	CONSTRAINT "restaurant_external_refs_provider_ck" CHECK ("restaurant_external_references"."provider" = 'google_places'),
	CONSTRAINT "restaurant_external_refs_external_nonblank_ck" CHECK (btrim("restaurant_external_references"."external_id") <> '')
);
--> statement-breakpoint
CREATE TABLE "restaurant_menu_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"evidence_set_id" uuid NOT NULL,
	"menu_scope" text NOT NULL,
	"state" text NOT NULL,
	"version_ordinal" integer NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"supersedes_menu_version_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "restaurant_menu_versions_id_restaurant_uq" UNIQUE("id","restaurant_id"),
	CONSTRAINT "restaurant_menu_versions_ordinal_uq" UNIQUE("restaurant_id","menu_scope","version_ordinal"),
	CONSTRAINT "restaurant_menu_versions_scope_ck" CHECK ("restaurant_menu_versions"."menu_scope" in ('default', 'all_day', 'breakfast', 'brunch', 'lunch', 'dinner', 'drinks', 'dessert', 'happy_hour', 'kids', 'late_night', 'seasonal')),
	CONSTRAINT "restaurant_menu_versions_state_ck" CHECK ("restaurant_menu_versions"."state" in ('draft', 'active', 'stale', 'superseded', 'retired')),
	CONSTRAINT "restaurant_menu_versions_lifetime_ck" CHECK ("restaurant_menu_versions"."version_ordinal" > 0
        and ("restaurant_menu_versions"."valid_until" is null or "restaurant_menu_versions"."valid_until" > "restaurant_menu_versions"."valid_from")
        and ("restaurant_menu_versions"."supersedes_menu_version_id" is null or "restaurant_menu_versions"."supersedes_menu_version_id" <> "restaurant_menu_versions"."id"))
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "restaurants_display_name_nonblank_ck" CHECK (btrim("restaurants"."display_name") <> '')
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_evidence_set_id_menu_evidence_sets_id_fk" FOREIGN KEY ("evidence_set_id") REFERENCES "public"."menu_evidence_sets"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_analysis_contract_id_analysis_contracts_id_fk" FOREIGN KEY ("analysis_contract_id") REFERENCES "public"."analysis_contracts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "canonical_analyses" ADD CONSTRAINT "canonical_analyses_run_identity_fk" FOREIGN KEY ("producing_run_id","evidence_set_id","analysis_contract_id") REFERENCES "public"."analysis_runs"("id","evidence_set_id","analysis_contract_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "menu_item_dish_matches" ADD CONSTRAINT "menu_item_dish_matches_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "menu_item_dish_matches" ADD CONSTRAINT "menu_item_dish_matches_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_restaurant_fk" FOREIGN KEY ("restaurant_menu_version_id","restaurant_id") REFERENCES "public"."restaurant_menu_versions"("id","restaurant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "publication_receipts" ADD CONSTRAINT "publication_receipts_analysis_identity_fk" FOREIGN KEY ("analysis_id","restaurant_id","restaurant_menu_version_id") REFERENCES "public"."canonical_analyses"("id","restaurant_id","restaurant_menu_version_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "publication_receipts" ADD CONSTRAINT "publication_receipts_menu_restaurant_fk" FOREIGN KEY ("restaurant_menu_version_id","restaurant_id") REFERENCES "public"."restaurant_menu_versions"("id","restaurant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "restaurant_external_references" ADD CONSTRAINT "restaurant_external_references_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "restaurant_menu_versions" ADD CONSTRAINT "restaurant_menu_versions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "restaurant_menu_versions" ADD CONSTRAINT "restaurant_menu_versions_evidence_set_id_menu_evidence_sets_id_fk" FOREIGN KEY ("evidence_set_id") REFERENCES "public"."menu_evidence_sets"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "restaurant_menu_versions" ADD CONSTRAINT "restaurant_menu_versions_predecessor_fk" FOREIGN KEY ("supersedes_menu_version_id","restaurant_id") REFERENCES "public"."restaurant_menu_versions"("id","restaurant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_runs_one_processing_uq" ON "analysis_runs" USING btree ("evidence_set_id","analysis_contract_id") WHERE "analysis_runs"."status" = 'processing';--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_analyses_active_exact_uq" ON "canonical_analyses" USING btree ("evidence_set_id","analysis_contract_id") WHERE "canonical_analyses"."invalidated_at" is null;--> statement-breakpoint
CREATE INDEX "dishes_display_name_idx" ON "dishes" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "dishes_normalized_name_idx" ON "dishes" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_menu_versions_one_active_uq" ON "restaurant_menu_versions" USING btree ("restaurant_id","menu_scope") WHERE "restaurant_menu_versions"."state" = 'active';