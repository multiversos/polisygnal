"""Add research foundation tables and prediction family fields."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0006_research_foundation"
down_revision = "0005_market_outcomes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("market_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("vertical", sa.String(length=64), nullable=False),
        sa.Column("subvertical", sa.String(length=64), nullable=True),
        sa.Column("market_shape", sa.String(length=64), nullable=False),
        sa.Column("research_mode", sa.String(length=32), nullable=False),
        sa.Column("model_used", sa.String(length=128), nullable=True),
        sa.Column(
            "web_search_used",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "degraded_mode",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "total_sources_found",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "total_sources_used",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("confidence_score", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["market_id"], ["markets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_research_runs_market_id", "research_runs", ["market_id"], unique=False)
    op.create_index("ix_research_runs_started_at", "research_runs", ["started_at"], unique=False)

    op.create_table(
        "research_findings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("research_run_id", sa.Integer(), nullable=False),
        sa.Column("market_id", sa.Integer(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("factor_type", sa.String(length=64), nullable=False),
        sa.Column("stance", sa.String(length=32), nullable=False),
        sa.Column("impact_score", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("freshness_score", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("credibility_score", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("evidence_summary", sa.Text(), nullable=False),
        sa.Column("citation_url", sa.String(length=1024), nullable=True),
        sa.Column("source_name", sa.String(length=255), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["market_id"], ["markets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["research_run_id"], ["research_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_research_findings_research_run_id",
        "research_findings",
        ["research_run_id"],
        unique=False,
    )
    op.create_index(
        "ix_research_findings_market_id",
        "research_findings",
        ["market_id"],
        unique=False,
    )
    op.create_index(
        "ix_research_findings_source_id",
        "research_findings",
        ["source_id"],
        unique=False,
    )

    op.add_column(
        "predictions",
        sa.Column(
            "prediction_family",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("'scoring_v1'"),
        ),
    )
    op.add_column("predictions", sa.Column("components_json", sa.JSON(), nullable=True))
    op.add_column("predictions", sa.Column("research_run_id", sa.Integer(), nullable=True))
    op.create_index(
        "ix_predictions_prediction_family",
        "predictions",
        ["prediction_family"],
        unique=False,
    )
    op.create_index(
        "ix_predictions_research_run_id",
        "predictions",
        ["research_run_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_predictions_research_run_id",
        "predictions",
        "research_runs",
        ["research_run_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "prediction_reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("market_id", sa.Integer(), nullable=False),
        sa.Column("prediction_id", sa.Integer(), nullable=True),
        sa.Column("research_run_id", sa.Integer(), nullable=True),
        sa.Column("thesis", sa.Text(), nullable=False),
        sa.Column("evidence_for", sa.JSON(), nullable=False),
        sa.Column("evidence_against", sa.JSON(), nullable=False),
        sa.Column("risks", sa.JSON(), nullable=False),
        sa.Column("final_reasoning", sa.Text(), nullable=False),
        sa.Column("recommendation", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["market_id"], ["markets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prediction_id"], ["predictions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["research_run_id"], ["research_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_prediction_reports_market_id", "prediction_reports", ["market_id"], unique=False)
    op.create_index(
        "ix_prediction_reports_prediction_id",
        "prediction_reports",
        ["prediction_id"],
        unique=False,
    )
    op.create_index(
        "ix_prediction_reports_research_run_id",
        "prediction_reports",
        ["research_run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_prediction_reports_research_run_id", table_name="prediction_reports")
    op.drop_index("ix_prediction_reports_prediction_id", table_name="prediction_reports")
    op.drop_index("ix_prediction_reports_market_id", table_name="prediction_reports")
    op.drop_table("prediction_reports")

    op.drop_constraint("fk_predictions_research_run_id", "predictions", type_="foreignkey")
    op.drop_index("ix_predictions_research_run_id", table_name="predictions")
    op.drop_index("ix_predictions_prediction_family", table_name="predictions")
    op.drop_column("predictions", "research_run_id")
    op.drop_column("predictions", "components_json")
    op.drop_column("predictions", "prediction_family")

    op.drop_index("ix_research_findings_source_id", table_name="research_findings")
    op.drop_index("ix_research_findings_market_id", table_name="research_findings")
    op.drop_index("ix_research_findings_research_run_id", table_name="research_findings")
    op.drop_table("research_findings")

    op.drop_index("ix_research_runs_started_at", table_name="research_runs")
    op.drop_index("ix_research_runs_market_id", table_name="research_runs")
    op.drop_table("research_runs")
