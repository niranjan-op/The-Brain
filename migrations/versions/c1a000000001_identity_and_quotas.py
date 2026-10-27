"""identity, projects, quotas

Revision ID: c1a000000001
Revises: b00f24e4b40a
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c1a000000001"
down_revision: Union[str, Sequence[str], None] = "b00f24e4b40a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE users (
        user_uuid     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid  text NOT NULL UNIQUE,
        email         text NOT NULL UNIQUE,
        display_name  text,
        plan          text NOT NULL DEFAULT 'free',
        created_at    timestamptz NOT NULL DEFAULT now(),
        last_seen_at  timestamptz,
        deleted_at    timestamptz
    );

    CREATE TABLE projects (
        project_uuid     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name             text NOT NULL,
        created_by       uuid NOT NULL REFERENCES users(user_uuid),
        max_members      int NOT NULL DEFAULT 4,
        max_docs         int,
        max_chunks       int,
        max_graph_nodes  int,
        daily_llm_calls  int,
        daily_uploads    int,
        created_at       timestamptz NOT NULL DEFAULT now(),
        deleted_at       timestamptz
    );

    CREATE TABLE project_members (
        project_uuid  uuid NOT NULL REFERENCES projects(project_uuid),
        user_uuid     uuid NOT NULL REFERENCES users(user_uuid),
        role          text NOT NULL CHECK (role IN ('owner', 'edit', 'view')),
        joined_at     timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_uuid, user_uuid)
    );
    CREATE UNIQUE INDEX project_one_owner ON project_members (project_uuid) WHERE role = 'owner';
    CREATE INDEX project_members_user ON project_members (user_uuid);

    CREATE TABLE invites (
        invite_uuid   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_uuid  uuid NOT NULL REFERENCES projects(project_uuid),
        email         text NOT NULL,
        role          text NOT NULL CHECK (role IN ('edit', 'view')),
        invited_by    uuid NOT NULL REFERENCES users(user_uuid),
        expires_at    timestamptz NOT NULL,
        accepted_at   timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE usage (
        scope_type  text NOT NULL CHECK (scope_type IN ('user', 'project', 'global')),
        scope_id    text NOT NULL,
        day         date NOT NULL,
        kind        text NOT NULL CHECK (kind IN ('llm_call', 'doc_upload', 'embed_query', 'web_search', 'serp_search')),
        used        int NOT NULL DEFAULT 0,
        PRIMARY KEY (scope_type, scope_id, day, kind)
    );

    CREATE TABLE usage_events (
        event_uuid    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_uuid     uuid NOT NULL REFERENCES users(user_uuid),
        project_uuid  uuid REFERENCES projects(project_uuid),
        kind          text NOT NULL,
        amount        int NOT NULL DEFAULT 1,
        job_uuid      uuid,
        message_uuid  uuid,
        created_at    timestamptz NOT NULL DEFAULT now(),
        refunded_at   timestamptz
    );

    CREATE TABLE search_limits (
        user_uuid       uuid PRIMARY KEY REFERENCES users(user_uuid),
        serp_per_hour   int CHECK (serp_per_hour <= 50),
        serp_per_day    int,
        serp_per_month  int CHECK (serp_per_month <= 250),
        updated_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE devices (
        device_id         text PRIMARY KEY,
        fingerprint_hash  text NOT NULL,
        first_seen_at     timestamptz NOT NULL DEFAULT now(),
        last_seen_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE account_devices (
        user_uuid      uuid NOT NULL REFERENCES users(user_uuid),
        device_id      text NOT NULL REFERENCES devices(device_id),
        first_seen_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_uuid, device_id)
    );
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE account_devices, devices, search_limits, usage_events, usage,
               invites, project_members, projects, users;
    """)
