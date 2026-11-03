"""rename documents.gcs_path to storage_path (provider-neutral)

Revision ID: c1a000000005
Revises: c1a000000004
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c1a000000005"
down_revision: Union[str, Sequence[str], None] = "c1a000000004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE documents RENAME COLUMN gcs_path TO storage_path")


def downgrade() -> None:
    op.execute("ALTER TABLE documents RENAME COLUMN storage_path TO gcs_path")
