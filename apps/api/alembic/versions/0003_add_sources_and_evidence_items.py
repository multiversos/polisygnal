"""Add sources and evidence items tables."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0003_evidence_tables"
down_revision = "0002_add_market_classification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sources",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("market_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("external_id", sa.String(length=1024), nullable=False),
        sa.Column("title", sa.String(length=1024), nullable=True),
        sa.Column("url", sa.String(length=1024), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("raw_json", sa.JSON(), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["market_id"], ["markets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "market_id",
            "provider",
            "external_id",
            name="uq_sources_market_provider_external",
        ),
    )
    op.create_index("ix_sources_market_id", "sources", ["market_id"], unique=False)

    op.create_table(
        "evidence_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("market_id", sa.Integer(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("evidence_type", sa.String(length=32), nullable=False),
        sa.Column("stance", sa.String(length=32), nullable=False),
        sa.Column("strength", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("confidence", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("high_contradiction", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("bookmaker_count", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["market_id"], ["markets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", "evidence_type", name="uq_evidence_items_source_type"),
    )
    op.create_index("ix_evidence_items_market_id", "evidence_items", ["market_id"], unique=False)
    op.create_index("ix_evidence_items_source_id", "evidence_items", ["source_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_evidence_items_source_id", table_name="evidence_items")
    op.drop_index("ix_evidence_items_market_id", table_name="evidence_items")
    op.drop_table("evidence_items")
    op.drop_index("ix_sources_market_id", table_name="sources")
    op.drop_table("sources")
