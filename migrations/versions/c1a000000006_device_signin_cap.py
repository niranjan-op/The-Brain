"""device sign-in cap (D024): drop fingerprint_hash, add account_devices.last_login_at

Revision ID: c1a000000006
Revises: c1a000000005
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c1a000000006"
down_revision: Union[str, Sequence[str], None] = "c1a000000005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE devices DROP COLUMN fingerprint_hash;
    ALTER TABLE account_devices ADD COLUMN last_login_at timestamptz NOT NULL DEFAULT now();
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE account_devices DROP COLUMN last_login_at;
    ALTER TABLE devices ADD COLUMN fingerprint_hash text NOT NULL DEFAULT '';
    """)
