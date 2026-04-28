"""Add market tags."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0011_market_tags"
down_revision = "0010_market_investigation_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "market_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=140), nullable=False),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("tag_type", sa.String(length=24), server_default="manual", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "tag_type in ('manual', 'system')",
            name="ck_market_tags_tag_type",
        ),
        sa.UniqueConstraint("slug", name="uq_market_tags_slug"),
    )
    op.create_index("ix_market_tags_slug", "market_tags", ["slug"])
    op.create_index("ix_market_tags_tag_type", "market_tags", ["tag_type"])

    op.create_table(
        "market_tag_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "market_id",
            sa.Integer(),
            sa.ForeignKey("markets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tag_id",
            sa.Integer(),
            sa.ForeignKey("market_tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("market_id", "tag_id", name="uq_market_tag_links_market_tag"),
    )
    op.create_index("ix_market_tag_links_market_id", "market_tag_links", ["market_id"])
    op.create_index("ix_market_tag_links_tag_id", "market_tag_links", ["tag_id"])


def downgrade() -> None:
    op.drop_index("ix_market_tag_links_tag_id", table_name="market_tag_links")
    op.drop_index("ix_market_tag_links_market_id", table_name="market_tag_links")
    op.drop_table("market_tag_links")
    op.drop_index("ix_market_tags_tag_type", table_name="market_tags")
    op.drop_index("ix_market_tags_slug", table_name="market_tags")
    op.drop_table("market_tags")
