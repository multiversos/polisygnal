"""Add market investigation statuses."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0010_market_investigation_status"
down_revision = "0009_watchlist_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "market_investigation_statuses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "market_id",
            sa.Integer(),
            sa.ForeignKey("markets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=32),
            server_default="pending_review",
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=True),
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
            "status in ('pending_review', 'investigating', 'has_evidence', 'review_required', 'dismissed', 'paused')",
            name="ck_market_investigation_statuses_status",
        ),
        sa.UniqueConstraint("market_id", name="uq_market_investigation_statuses_market_id"),
    )
    op.create_index(
        "ix_market_investigation_statuses_market_id",
        "market_investigation_statuses",
        ["market_id"],
    )
    op.create_index(
        "ix_market_investigation_statuses_status",
        "market_investigation_statuses",
        ["status"],
    )
    op.create_index(
        "ix_market_investigation_statuses_priority",
        "market_investigation_statuses",
        ["priority"],
    )
    op.create_index(
        "ix_market_investigation_statuses_updated_at",
        "market_investigation_statuses",
        ["updated_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_market_investigation_statuses_updated_at",
        table_name="market_investigation_statuses",
    )
    op.drop_index(
        "ix_market_investigation_statuses_priority",
        table_name="market_investigation_statuses",
    )
    op.drop_index(
        "ix_market_investigation_statuses_status",
        table_name="market_investigation_statuses",
    )
    op.drop_index(
        "ix_market_investigation_statuses_market_id",
        table_name="market_investigation_statuses",
    )
    op.drop_table("market_investigation_statuses")
