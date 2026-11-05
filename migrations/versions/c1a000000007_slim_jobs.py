"""slim jobs table: drop queue, progress, priority, result; payload nullable

Revision ID: c1a000000007
Revises: c1a000000006
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c1a000000007"
down_revision: Union[str, Sequence[str], None] = "c1a000000006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    DROP INDEX jobs_queued;
    ALTER TABLE jobs DROP COLUMN queue, DROP COLUMN progress, DROP COLUMN priority, DROP COLUMN result;
    ALTER TABLE jobs ALTER COLUMN payload DROP NOT NULL, ALTER COLUMN payload DROP DEFAULT;
    CREATE INDEX jobs_queued ON jobs (run_after) WHERE status = 'queued';
    """)


def downgrade() -> None:
    op.execute("""
    DROP INDEX jobs_queued;
    UPDATE jobs SET payload = '{}' WHERE payload IS NULL;
    ALTER TABLE jobs ALTER COLUMN payload SET DEFAULT '{}', ALTER COLUMN payload SET NOT NULL;
    ALTER TABLE jobs ADD COLUMN queue text NOT NULL DEFAULT 'default',
                     ADD COLUMN progress real,
                     ADD COLUMN priority int NOT NULL DEFAULT 0,
                     ADD COLUMN result jsonb;
    CREATE INDEX jobs_queued ON jobs (priority, run_after) WHERE status = 'queued';
    """)
