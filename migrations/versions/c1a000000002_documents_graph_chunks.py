"""documents, graph, partitioned chunks

Revision ID: c1a000000002
Revises: c1a000000001
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c1a000000002"
down_revision: Union[str, Sequence[str], None] = "c1a000000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE documents (
        doc_uuid      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_uuid  uuid NOT NULL REFERENCES projects(project_uuid),
        filename      text NOT NULL,
        doc_hash      text NOT NULL,
        uploaded_by   uuid NOT NULL REFERENCES users(user_uuid),
        mime_type     text,
        size_bytes    bigint,
        gcs_path      text,
        status        text NOT NULL DEFAULT 'uploaded'
                      CHECK (status IN ('uploaded', 'processing', 'ready', 'failed')),
        page_count    int,
        error         text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        deleted_at    timestamptz,
        UNIQUE (project_uuid, doc_hash),
        UNIQUE (project_uuid, doc_uuid)
    );
    CREATE INDEX documents_project_status ON documents (project_uuid, status);

    -- Graph: Postgres is the source of truth, Neo4j is a projection.
    CREATE TABLE nodes (
        node_uuid     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_uuid  uuid NOT NULL REFERENCES projects(project_uuid),
        type          text NOT NULL,
        role          text,
        layer         text,
        name          text NOT NULL,
        summary       text,
        text          text,
        aliases       text[] NOT NULL DEFAULT '{}',
        status        text,
        embedding     vector(768),
        created_by    uuid REFERENCES users(user_uuid),
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        UNIQUE (project_uuid, node_uuid)
    );

    CREATE TABLE edges (
        edge_uuid     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_uuid  uuid NOT NULL REFERENCES projects(project_uuid),
        src_node      uuid NOT NULL,
        dst_node      uuid NOT NULL,
        type          text NOT NULL,
        kind          text,
        scope         text CHECK (scope IN ('full', 'partial')),
        aspects       text[] NOT NULL DEFAULT '{}',
        status        text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (project_uuid, src_node) REFERENCES nodes (project_uuid, node_uuid),
        FOREIGN KEY (project_uuid, dst_node) REFERENCES nodes (project_uuid, node_uuid)
    );
    CREATE INDEX edges_src ON edges (project_uuid, src_node);
    CREATE INDEX edges_dst ON edges (project_uuid, dst_node);

    CREATE TABLE evidence (
        id            bigserial PRIMARY KEY,
        project_uuid  uuid NOT NULL REFERENCES projects(project_uuid),
        kind          text NOT NULL CHECK (kind IN ('chunk', 'chat', 'url', 'commit')),
        ref           text NOT NULL,
        doc_uuid      uuid,
        excerpt       text,
        FOREIGN KEY (project_uuid, doc_uuid) REFERENCES documents (project_uuid, doc_uuid)
    );
    CREATE INDEX evidence_project_doc ON evidence (project_uuid, doc_uuid);

    CREATE TABLE node_evidence (
        node_uuid    uuid REFERENCES nodes(node_uuid),
        edge_uuid    uuid REFERENCES edges(edge_uuid),
        evidence_id  bigint NOT NULL REFERENCES evidence(id),
        CHECK (num_nonnulls(node_uuid, edge_uuid) = 1)
    );
    CREATE INDEX node_evidence_node ON node_evidence (node_uuid);
    CREATE INDEX node_evidence_edge ON node_evidence (edge_uuid);

    CREATE TABLE graph_changes (
        change_id     bigserial PRIMARY KEY,
        project_uuid  uuid NOT NULL REFERENCES projects(project_uuid),
        op            text NOT NULL,
        payload       jsonb NOT NULL,
        actor_user    uuid REFERENCES users(user_uuid),
        convo_uuid    uuid,
        created_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE graph_sync_state (
        project_uuid           uuid PRIMARY KEY REFERENCES projects(project_uuid),
        last_applied_change_id bigint NOT NULL DEFAULT 0,
        updated_at             timestamptz NOT NULL DEFAULT now()
    );

    -- One partition per project (D022). Created by a trigger, so a project can never exist without one.
    CREATE TABLE chunks (
        chunk_id      text NOT NULL,
        project_uuid  uuid NOT NULL REFERENCES projects(project_uuid),
        doc_uuid      uuid NOT NULL,
        ordinal       int NOT NULL,
        kind          text NOT NULL,
        heading_path  text,
        page_start    int,
        page_end      int,
        text          text NOT NULL,
        embed_text    text NOT NULL,
        text_hash     text NOT NULL,
        payload       jsonb NOT NULL DEFAULT '{}',
        embedding     vector(768),
        embed_model   text,
        dims          int,
        node_uuid     uuid,
        created_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_uuid, chunk_id),
        FOREIGN KEY (project_uuid, doc_uuid) REFERENCES documents (project_uuid, doc_uuid),
        FOREIGN KEY (project_uuid, node_uuid) REFERENCES nodes (project_uuid, node_uuid)
    ) PARTITION BY LIST (project_uuid);

    CREATE INDEX chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX chunks_embed_text_bm25 ON chunks USING bm25 (embed_text) WITH (text_config = 'english');
    CREATE INDEX chunks_doc ON chunks (doc_uuid);

    CREATE FUNCTION create_project_partition() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        EXECUTE format('CREATE TABLE %I PARTITION OF chunks FOR VALUES IN (%L)',
                       'chunks_' || replace(NEW.project_uuid::text, '-', ''), NEW.project_uuid);
        RETURN NEW;
    END $$;

    CREATE TRIGGER projects_create_partition AFTER INSERT ON projects
        FOR EACH ROW EXECUTE FUNCTION create_project_partition();
    """)


def downgrade() -> None:
    op.execute("""
    DROP TRIGGER projects_create_partition ON projects;
    DROP FUNCTION create_project_partition();
    DROP TABLE chunks, graph_sync_state, graph_changes, node_evidence, evidence,
               edges, nodes, documents;
    """)
