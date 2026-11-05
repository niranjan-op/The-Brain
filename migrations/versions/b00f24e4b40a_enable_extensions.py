"""enable extensions

Revision ID: b00f24e4b40a
Revises:
Create Date: 2026-10-27 22:10:44.660257

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b00f24e4b40a'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
      op.execute("CREATE EXTENSION IF NOT EXISTS vector")
      op.execute("CREATE EXTENSION IF NOT EXISTS pg_textsearch")


def downgrade() -> None:
      op.execute("DROP EXTENSION IF EXISTS pg_textsearch")
      op.execute("DROP EXTENSION IF EXISTS vector")
