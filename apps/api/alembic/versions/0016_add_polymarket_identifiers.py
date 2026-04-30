"""add polymarket public identifiers

Revision ID: 0016_add_polymarket_identifiers
Revises: 0015_manual_evidence_items
Create Date: 2026-04-29 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0016_add_polymarket_identifiers"
down_revision = "0015_manual_evidence_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("markets", sa.Column("condition_id", sa.String(length=128), nullable=True))
    op.add_column("markets", sa.Column("question_id", sa.String(length=128), nullable=True))
    op.add_column("markets", sa.Column("clob_token_ids", sa.JSON(), nullable=True))
    op.add_column("markets", sa.Column("outcome_tokens", sa.JSON(), nullable=True))
    op.add_column("markets", sa.Column("polymarket_url", sa.String(length=1024), nullable=True))
    op.create_index("ix_markets_condition_id", "markets", ["condition_id"])
    op.create_index("ix_markets_question_id", "markets", ["question_id"])


def downgrade() -> None:
    op.drop_index("ix_markets_question_id", table_name="markets")
    op.drop_index("ix_markets_condition_id", table_name="markets")
    op.drop_column("markets", "polymarket_url")
    op.drop_column("markets", "outcome_tokens")
    op.drop_column("markets", "clob_token_ids")
    op.drop_column("markets", "question_id")
    op.drop_column("markets", "condition_id")
