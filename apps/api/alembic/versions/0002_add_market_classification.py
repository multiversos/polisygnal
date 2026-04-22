"""Add market classification fields."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0002_add_market_classification"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("markets", sa.Column("sport_type", sa.String(length=32), nullable=True))
    op.add_column("markets", sa.Column("market_type", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("markets", "market_type")
    op.drop_column("markets", "sport_type")
