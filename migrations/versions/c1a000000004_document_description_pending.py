"""document description, kind, and pending status

Revision ID: c1a000000004
Revises: c1a000000003
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c1a000000004"
down_revision: Union[str, Sequence[str], None] = "c1a000000003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE documents DROP CONSTRAINT documents_status_check;
    ALTER TABLE documents ADD CONSTRAINT documents_status_check
        CHECK (status IN ('pending', 'uploaded', 'processing', 'ready', 'failed'));
    ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'pending';
    ALTER TABLE documents ADD COLUMN doc_kind    text;
    ALTER TABLE documents ADD COLUMN description text;
    """)


def downgrade() -> None:
    op.execute("""
    UPDATE documents SET status = 'uploaded' WHERE status = 'pending';
    ALTER TABLE documents DROP COLUMN description, DROP COLUMN doc_kind;
    ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'uploaded';
    ALTER TABLE documents DROP CONSTRAINT documents_status_check;
    ALTER TABLE documents ADD CONSTRAINT documents_status_check
        CHECK (status IN ('uploaded', 'processing', 'ready', 'failed'));
    """)
