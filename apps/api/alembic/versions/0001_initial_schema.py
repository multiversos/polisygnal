"""Initial schema for PolySignal MVP."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("polymarket_event_id", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("category", sa.String(length=128), nullable=True),
        sa.Column("slug", sa.String(length=256), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("closed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("polymarket_event_id"),
        sa.UniqueConstraint("slug"),
    )

    op.create_table(
        "markets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("polymarket_market_id", sa.String(length=128), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("question", sa.String(length=512), nullable=False),
        sa.Column("slug", sa.String(length=256), nullable=False),
        sa.Column("yes_token_id", sa.String(length=128), nullable=True),
        sa.Column("no_token_id", sa.String(length=128), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("closed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rules_text", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("polymarket_market_id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_markets_event_id", "markets", ["event_id"], unique=False)
    op.create_index("ix_markets_active", "markets", ["active"], unique=False)

    op.create_table(
        "market_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("market_id", sa.Integer(), nullable=False),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("yes_price", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("no_price", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("midpoint", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("last_trade_price", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("spread", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("volume", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("liquidity", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.ForeignKeyConstraint(["market_id"], ["markets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_market_snapshots_market_id",
        "market_snapshots",
        ["market_id"],
        unique=False,
    )
    op.create_index(
        "ix_market_snapshots_captured_at",
        "market_snapshots",
        ["captured_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_market_snapshots_captured_at", table_name="market_snapshots")
    op.drop_index("ix_market_snapshots_market_id", table_name="market_snapshots")
    op.drop_table("market_snapshots")
    op.drop_index("ix_markets_active", table_name="markets")
    op.drop_index("ix_markets_event_id", table_name="markets")
    op.drop_table("markets")
    op.drop_table("events")

