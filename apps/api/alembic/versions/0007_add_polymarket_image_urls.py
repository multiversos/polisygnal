"""Add Polymarket image URL fields."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0007_add_polymarket_image_urls"
down_revision = "0006_research_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("image_url", sa.String(length=1024), nullable=True))
    op.add_column("events", sa.Column("icon_url", sa.String(length=1024), nullable=True))
    op.add_column("markets", sa.Column("image_url", sa.String(length=1024), nullable=True))
    op.add_column("markets", sa.Column("icon_url", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    op.drop_column("markets", "icon_url")
    op.drop_column("markets", "image_url")
    op.drop_column("events", "icon_url")
    op.drop_column("events", "image_url")
