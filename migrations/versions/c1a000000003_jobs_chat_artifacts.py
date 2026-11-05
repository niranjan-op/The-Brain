"""jobs, conversations, research, artifacts

Revision ID: c1a000000003
Revises: c1a000000002
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c1a000000003"
down_revision: Union[str, Sequence[str], None] = "c1a000000002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE jobs (
        job_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_uuid      uuid NOT NULL REFERENCES projects(project_uuid),
        user_uuid         uuid NOT NULL REFERENCES users(user_uuid),
        doc_uuid          uuid,
        type              text NOT NULL,
        payload           jsonb NOT NULL DEFAULT '{}',
        status            text NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled')),
        queue             text NOT NULL DEFAULT 'default',
        stage             text,
        progress          real,
        priority          int NOT NULL DEFAULT 0,
        attempts          int NOT NULL DEFAULT 0,
        max_attempts      int NOT NULL DEFAULT 3,
        run_after         timestamptz NOT NULL DEFAULT now(),
        locked_by         text,
        locked_until      timestamptz,
        cancel_requested  boolean NOT NULL DEFAULT false,
        idempotency_key   text UNIQUE,
        result            jsonb,
        error             text,
        created_at        timestamptz NOT NULL DEFAULT now(),
        started_at        timestamptz,
        finished_at       timestamptz,
        FOREIGN KEY (project_uuid, doc_uuid) REFERENCES documents (project_uuid, doc_uuid)
    );
    CREATE INDEX jobs_queued ON jobs (priority, run_after) WHERE status = 'queued';

    CREATE TABLE conversations (
        convo_uuid    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_uuid  uuid NOT NULL REFERENCES projects(project_uuid),
        created_by    uuid NOT NULL REFERENCES users(user_uuid),
        title         text,
        visibility    text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'private')),
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        deleted_at    timestamptz
    );

    CREATE TABLE conversation_excluded_sources (
        convo_uuid   uuid NOT NULL REFERENCES conversations(convo_uuid),
        doc_uuid     uuid NOT NULL REFERENCES documents(doc_uuid),
        excluded_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (convo_uuid, doc_uuid)
    );

    CREATE TABLE messages (
        message_uuid   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        convo_uuid     uuid NOT NULL REFERENCES conversations(convo_uuid),
        user_uuid      uuid REFERENCES users(user_uuid),
        content        text,
        type           text NOT NULL CHECK (type IN ('human', 'ai')),
        status         text NOT NULL DEFAULT 'answered'
                       CHECK (status IN ('pending', 'streaming', 'paused', 'answered', 'failed', 'cancelled')),
        mode           text CHECK (mode IN ('managed', 'byok')),
        model          text,
        input_tokens   int,
        output_tokens  int,
        source_scope   uuid[],
        error          text,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX messages_convo_created ON messages (convo_uuid, created_at);

    CREATE TABLE message_sources (
        message_uuid  uuid NOT NULL REFERENCES messages(message_uuid),
        source_kind   text NOT NULL CHECK (source_kind IN ('chunk', 'node', 'url')),
        source_id     text NOT NULL,
        rank          int,
        PRIMARY KEY (message_uuid, source_kind, source_id)
    );

    CREATE TABLE research_runs (
        run_uuid           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_uuid       uuid NOT NULL REFERENCES projects(project_uuid),
        convo_uuid         uuid NOT NULL REFERENCES conversations(convo_uuid),
        user_uuid          uuid NOT NULL REFERENCES users(user_uuid),
        question           text NOT NULL,
        plan               jsonb,
        status             text NOT NULL DEFAULT 'planned'
                           CHECK (status IN ('planned', 'running', 'paused', 'completed', 'failed', 'cancelled')),
        mode               text CHECK (mode IN ('managed', 'byok')),
        search_source      text CHECK (search_source IN ('vertex', 'serpapi', 'none')),
        searches_used      int NOT NULL DEFAULT 0,
        search_budget      int,
        steps_used         int NOT NULL DEFAULT 0,
        runner_id          text,
        lease_until        timestamptz,
        last_heartbeat_at  timestamptz,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        finished_at        timestamptz,
        expires_at         timestamptz
    );
    CREATE INDEX research_runs_user_status ON research_runs (user_uuid, status);

    CREATE TABLE search_cache (
        query_hash  text PRIMARY KEY,
        source      text NOT NULL CHECK (source IN ('vertex', 'serpapi')),
        query       text NOT NULL,
        results     jsonb NOT NULL,
        fetched_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL
    );

    CREATE TABLE artifacts (
        artifact_uuid    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_uuid     uuid NOT NULL REFERENCES projects(project_uuid),
        convo_uuid       uuid REFERENCES conversations(convo_uuid),
        created_by       uuid NOT NULL REFERENCES users(user_uuid),
        type             text NOT NULL
                         CHECK (type IN ('architecture_plan', 'adr', 'prd', 'report', 'diagram', 'other')),
        title            text NOT NULL,
        status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
        current_version  int NOT NULL DEFAULT 1,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        deleted_at       timestamptz
    );

    CREATE TABLE artifact_versions (
        artifact_uuid  uuid NOT NULL REFERENCES artifacts(artifact_uuid),
        version        int NOT NULL,
        content        text NOT NULL,
        source_refs    jsonb,
        model          text,
        mode           text CHECK (mode IN ('managed', 'byok')),
        created_at     timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (artifact_uuid, version)
    );
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE artifact_versions, artifacts, search_cache, research_runs,
               message_sources, messages, conversation_excluded_sources,
               conversations, jobs;
    """)
