"""add manual evidence items

Revision ID: 0015_manual_evidence_items
Revises: 0014_refresh_runs
Create Date: 2026-04-29 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0015_manual_evidence_items"
down_revision = "0014_refresh_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "manual_evidence_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "market_id",
            sa.Integer(),
            sa.ForeignKey("markets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_name", sa.String(length=256), nullable=False),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=True),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("stance", sa.String(length=32), nullable=False),
        sa.Column("evidence_type", sa.String(length=64), nullable=True),
        sa.Column("credibility_score", sa.Numeric(5, 4), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "review_status",
            sa.String(length=32),
            server_default="pending_review",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "stance in ('favor_yes', 'against_yes', 'neutral', 'risk')",
            name="ck_manual_evidence_items_stance",
        ),
        sa.CheckConstraint(
            "review_status in ('pending_review', 'reviewed', 'rejected')",
            name="ck_manual_evidence_items_review_status",
        ),
    )
    op.create_index(
        "ix_manual_evidence_items_market_id",
        "manual_evidence_items",
        ["market_id"],
    )
    op.create_index(
        "ix_manual_evidence_items_review_status",
        "manual_evidence_items",
        ["review_status"],
    )
    op.create_index(
        "ix_manual_evidence_items_stance",
        "manual_evidence_items",
        ["stance"],
    )


def downgrade() -> None:
    op.drop_index("ix_manual_evidence_items_stance", table_name="manual_evidence_items")
    op.drop_index("ix_manual_evidence_items_review_status", table_name="manual_evidence_items")
    op.drop_index("ix_manual_evidence_items_market_id", table_name="manual_evidence_items")
    op.drop_table("manual_evidence_items")
