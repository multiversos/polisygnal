"""Add external market signals."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0008_external_market_signals"
down_revision = "0007_add_polymarket_image_urls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_market_signals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("source_market_id", sa.String(length=256), nullable=True),
        sa.Column("source_event_id", sa.String(length=256), nullable=True),
        sa.Column("source_ticker", sa.String(length=256), nullable=True),
        sa.Column(
            "polymarket_market_id",
            sa.Integer(),
            sa.ForeignKey("markets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(length=1024), nullable=True),
        sa.Column("yes_probability", sa.Numeric(10, 4), nullable=True),
        sa.Column("no_probability", sa.Numeric(10, 4), nullable=True),
        sa.Column("best_yes_bid", sa.Numeric(10, 4), nullable=True),
        sa.Column("best_yes_ask", sa.Numeric(10, 4), nullable=True),
        sa.Column("best_no_bid", sa.Numeric(10, 4), nullable=True),
        sa.Column("best_no_ask", sa.Numeric(10, 4), nullable=True),
        sa.Column("mid_price", sa.Numeric(10, 4), nullable=True),
        sa.Column("last_price", sa.Numeric(10, 4), nullable=True),
        sa.Column("volume", sa.Numeric(18, 4), nullable=True),
        sa.Column("liquidity", sa.Numeric(18, 4), nullable=True),
        sa.Column("open_interest", sa.Numeric(18, 4), nullable=True),
        sa.Column("spread", sa.Numeric(10, 4), nullable=True),
        sa.Column("source_confidence", sa.Numeric(10, 4), nullable=True),
        sa.Column("match_confidence", sa.Numeric(10, 4), nullable=True),
        sa.Column("match_reason", sa.Text(), nullable=True),
        sa.Column("warnings", sa.JSON(), nullable=True),
        sa.Column("raw_json", sa.JSON(), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_external_market_signals_source",
        "external_market_signals",
        ["source"],
    )
    op.create_index(
        "ix_external_market_signals_source_ticker",
        "external_market_signals",
        ["source_ticker"],
    )
    op.create_index(
        "ix_external_market_signals_polymarket_market_id",
        "external_market_signals",
        ["polymarket_market_id"],
    )
    op.create_index(
        "ix_external_market_signals_fetched_at",
        "external_market_signals",
        ["fetched_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_external_market_signals_fetched_at", table_name="external_market_signals")
    op.drop_index(
        "ix_external_market_signals_polymarket_market_id",
        table_name="external_market_signals",
    )
    op.drop_index("ix_external_market_signals_source_ticker", table_name="external_market_signals")
    op.drop_index("ix_external_market_signals_source", table_name="external_market_signals")
    op.drop_table("external_market_signals")
