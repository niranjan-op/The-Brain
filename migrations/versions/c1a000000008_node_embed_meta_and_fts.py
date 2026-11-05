"""node embed_model/dims metadata, btree index, and chunks fts gin index

Revision ID: c1a000000008
Revises: c1a000000007
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c1a000000008"
down_revision: Union[str, Sequence[str], None] = "c1a000000007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE nodes ADD COLUMN IF NOT EXISTS embed_model text;
    ALTER TABLE nodes ADD COLUMN IF NOT EXISTS dims int;

    UPDATE nodes
    SET embed_model = COALESCE(embed_model, 'BAAI/bge-base-en-v1.5'),
        dims = COALESCE(dims, 768)
    WHERE embedding IS NOT NULL;

    CREATE INDEX IF NOT EXISTS nodes_project_uuid_idx ON nodes (project_uuid);
    CREATE INDEX IF NOT EXISTS chunks_embed_text_fts ON chunks USING gin (to_tsvector('english', embed_text));
    """)


def downgrade() -> None:
    op.execute("""
    DROP INDEX IF EXISTS chunks_embed_text_fts;
    DROP INDEX IF EXISTS nodes_project_uuid_idx;
    ALTER TABLE nodes DROP COLUMN IF EXISTS dims;
    ALTER TABLE nodes DROP COLUMN IF EXISTS embed_model;
    """)

