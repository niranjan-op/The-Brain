Source of truth: Alembic migrations c1a000000001 to c1a000000007.

users
user_uuid (pk), firebase_uid (unique), email (unique), display_name, plan (default 'free'), created_at, last_seen_at, deleted_at

projects
project_uuid (pk), name, created_by (fk users), max_members (default 4), max_docs, max_chunks, max_graph_nodes, daily_llm_calls, daily_uploads, created_at, deleted_at
a trigger creates the project's chunks partition on insert

project_members
project_uuid (fk), user_uuid (fk), role (owner | edit | view), joined_at
pk (project_uuid, user_uuid); exactly one owner per project (partial unique index)

invites
invite_uuid (pk), project_uuid (fk), email, role (edit | view), invited_by (fk users), expires_at, accepted_at, created_at

usage
scope_type (user | project | global), scope_id (text), day, kind (llm_call | doc_upload | embed_query | web_search | serp_search), used
pk (scope_type, scope_id, day, kind)

usage_events
event_uuid (pk), user_uuid (fk), project_uuid (nullable fk), kind, amount, job_uuid (nullable), message_uuid (nullable), created_at, refunded_at

search_limits
user_uuid (pk, fk users), serp_per_hour (max 50), serp_per_day, serp_per_month (max 250), updated_at

devices
device_id (pk, text; random id kept by the browser), first_seen_at, last_seen_at

account_devices
user_uuid (fk), device_id (fk), first_seen_at, last_login_at
pk (user_uuid, device_id)
sign-in rule: at most 3 distinct accounts with last_login_at in the current IST day per device (enforced in POST /session/start)

documents
doc_uuid (pk), project_uuid (fk), filename, doc_hash, uploaded_by (fk users), mime_type, size_bytes, storage_path, status (pending | uploaded | processing | ready | failed; default pending), doc_kind (LLM label: architecture_diagram | table | photo | screenshot | other), description (LLM-generated summary), page_count, error, created_at, deleted_at
unique (project_uuid, doc_hash); unique (project_uuid, doc_uuid); index (project_uuid, status)

- pending: the row exists and validation has passed, but the file isn't safely stored yet. If a row stays in this state, the upload died partway.
- uploaded: the bytes are in object storage and storage_path is set. Nothing has processed the file yet, so it's waiting in the queue.
- processing: a worker has picked up the job and is chunking, embedding or describing it.
- ready: the chunks are in the vector DB and the file is searchable.
- failed: something broke. Store the reason in error.

chunks (PARTITION BY LIST (project_uuid); one partition per project)
chunk_id (content-derived), project_uuid (fk), doc_uuid, ordinal, kind, heading_path, page_start, page_end, text, embed_text, text_hash, payload (jsonb), embedding (vector(768)), embed_model, dims, node_uuid (nullable), created_at
pk (project_uuid, chunk_id); fk (project_uuid, doc_uuid) documents; fk (project_uuid, node_uuid) nodes
indexes: HNSW on embedding (cosine), BM25 on embed_text, btree on doc_uuid

jobs
job_id (pk), project_uuid (fk), user_uuid (fk), doc_uuid (nullable), type, payload (jsonb, nullable), status (queued | running | succeeded | failed | dead | cancelled), stage, attempts, max_attempts (default 3), run_after, locked_by, locked_until, cancel_requested, idempotency_key (unique), error, created_at, started_at, finished_at
fk (project_uuid, doc_uuid) documents; partial index (run_after) WHERE status = 'queued'

conversations
convo_uuid (pk), project_uuid (fk), created_by (fk users), title, visibility (shared | private), created_at, updated_at, deleted_at

conversation_excluded_sources
convo_uuid (fk), doc_uuid (fk), excluded_at
pk (convo_uuid, doc_uuid)

messages
message_uuid (pk), convo_uuid (fk), user_uuid (nullable; null for ai), content, type (human | ai), status (pending | streaming | paused | answered | failed | cancelled; default answered), mode (managed | byok), model, input_tokens, output_tokens, source_scope (uuid[]), error, created_at, updated_at
index (convo_uuid, created_at)

message_sources
message_uuid (fk), source_kind (chunk | node | url), source_id, rank
pk (message_uuid, source_kind, source_id)

research_runs
run_uuid (pk), project_uuid (fk), convo_uuid (fk), user_uuid (fk), question, plan (jsonb), status (planned | running | paused | completed | failed | cancelled), mode (managed | byok), search_source (vertex | serpapi | none), searches_used, search_budget, steps_used, runner_id, lease_until, last_heartbeat_at, created_at, updated_at, finished_at, expires_at
index (user_uuid, status)

search_cache
query_hash (pk), source (vertex | serpapi), query, results (jsonb), fetched_at, expires_at

nodes
node_uuid (pk), project_uuid (fk), type, role, layer, name, summary, text, aliases, status, embedding (vector(768)), created_by (nullable fk users), created_at, updated_at
unique (project_uuid, node_uuid)

edges
edge_uuid (pk), project_uuid (fk), src_node, dst_node, type, kind, scope (full | partial), aspects, status, created_at
fk (project_uuid, src_node) and (project_uuid, dst_node) nodes

evidence
id (pk), project_uuid (fk), kind (chunk | chat | url | commit), ref, doc_uuid (nullable), excerpt
fk (project_uuid, doc_uuid) documents; index (project_uuid, doc_uuid)

node_evidence
node_uuid (nullable fk), edge_uuid (nullable fk), evidence_id (fk evidence)
check: exactly one of node_uuid / edge_uuid is set

graph_changes
change_id (bigserial pk), project_uuid (fk), op, payload (jsonb), actor_user (nullable fk users), convo_uuid (nullable), created_at

graph_sync_state
project_uuid (pk, fk), last_applied_change_id, updated_at

artifacts
artifact_uuid (pk), project_uuid (fk), convo_uuid (nullable fk), created_by (fk users), type (architecture_plan | adr | prd | report | diagram | other), title, status (draft | final), current_version, created_at, updated_at, deleted_at

artifact_versions
artifact_uuid (fk), version, content (text), source_refs (jsonb: chunk and node ids), model, mode (managed | byok), created_at
pk (artifact_uuid, version)
