from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from html import escape
from pathlib import Path
import re

from sqlalchemy.orm import Session

from app.core.config import REPO_ROOT
from app.repositories.market_outcomes import get_market_outcome
from app.repositories.markets import get_market_by_id
from app.schemas.briefing import BriefingMarketItem
from app.schemas.evaluation import EvaluationSummaryResponse
from app.schemas.overview import MarketOverviewItem
from app.services.briefing import build_operational_briefing
from app.services.evaluation import build_evaluation_summary
from app.services.market_overview import build_markets_overview
from app.services.operational_status import build_operational_status

DEFAULT_DASHBOARD_TOP_LIMIT = 5
DEFAULT_DASHBOARD_WATCHLIST_LIMIT = 5


@dataclass(frozen=True)
class DashboardTableRow:
    market_id: int
    question: str
    yes_probability: Decimal | None
    confidence_score: Decimal | None
    edge_magnitude: Decimal | None
    priority_bucket: str
    evaluation_available: bool
    market_time_label: str
    market_status_label: str
    market_status_tone: str
    scoring_mode_label: str
    scoring_mode_tone: str


@dataclass(frozen=True)
class DashboardMarketMeta:
    time_label: str
    status_label: str
    status_tone: str


@dataclass(frozen=True)
class DashboardArtifact:
    generated_at: datetime
    overall_status: str | None
    total_top_opportunities: int
    total_watchlist: int
    top_opportunities: list[DashboardTableRow] = field(default_factory=list)
    watchlist: list[DashboardTableRow] = field(default_factory=list)
    evaluation: EvaluationSummaryResponse = field(default_factory=EvaluationSummaryResponse)


def build_dashboard_artifact(
    db: Session,
    *,
    sport_type: str | None = "nba",
    market_type: str | None = "winner",
    active: bool | None = True,
    top_limit: int = DEFAULT_DASHBOARD_TOP_LIMIT,
    watchlist_limit: int = DEFAULT_DASHBOARD_WATCHLIST_LIMIT,
    repo_root: Path | None = None,
) -> DashboardArtifact:
    root = repo_root or REPO_ROOT
    normalized_top_limit = max(0, top_limit)
    normalized_watchlist_limit = max(0, watchlist_limit)
    market_meta_cache: dict[int, DashboardMarketMeta] = {}

    briefing = build_operational_briefing(
        db,
        sport_type=sport_type,
        market_type=market_type,
        active=active,
        top_limit=normalized_top_limit,
        watchlist_limit=normalized_watchlist_limit,
        review_limit=0,
        repo_root=root,
    )
    top_opportunities = build_markets_overview(
        db,
        sport_type=sport_type,
        market_type=market_type,
        active=active,
        opportunity_only=True,
        evidence_eligible_only=False,
        evidence_only=False,
        fallback_only=False,
        bucket=None,
        edge_class=None,
        sort_by="priority",
        limit=normalized_top_limit,
        offset=0,
    )
    evaluation = build_evaluation_summary(db)

    overall_status: str | None = None
    try:
        overall_status = build_operational_status(repo_root=root).overall_status
    except Exception:
        overall_status = None

    return DashboardArtifact(
        generated_at=datetime.now(tz=UTC),
        overall_status=overall_status,
        total_top_opportunities=top_opportunities.total_count,
        total_watchlist=briefing.operational_counts.watchlist_count,
        top_opportunities=[
            _dashboard_row_from_overview_item(
                item,
                evaluation_available=_has_market_evaluation(db, item.market.id),
                market_meta=_resolve_market_card_meta(db, item.market.id, cache=market_meta_cache),
            )
            for item in top_opportunities.items
        ],
        watchlist=[
            _dashboard_row_from_briefing_item(
                item,
                evaluation_available=_has_market_evaluation(db, item.market_id),
                market_meta=_resolve_market_card_meta(
                    db,
                    item.market_id,
                    cache=market_meta_cache,
                ),
            )
            for item in briefing.watchlist
        ],
        evaluation=evaluation,
    )


def render_dashboard_html(dashboard: DashboardArtifact) -> str:
    generated_at = _format_datetime(dashboard.generated_at)
    overall_status = _translate_dashboard_status(dashboard.overall_status)
    return """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Panel de PolySignal</title>
  <style>
    :root {{
      --bg: #f4f6fb;
      --panel: rgba(255, 255, 255, 0.92);
      --panel-strong: #ffffff;
      --line: #dbe4ee;
      --line-strong: #c6d1de;
      --ink: #0f172a;
      --muted: #5f6f86;
      --muted-soft: #8b97ab;
      --shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
      --green: #129c59;
      --green-soft: #ebfaf2;
      --green-line: #b7ebcb;
      --red: #da4b63;
      --red-soft: #fff1f4;
      --red-line: #f6c5cf;
      --gray: #64748b;
      --gray-soft: #f1f5f9;
      --gray-line: #d7dfe8;
      --surface: #fbfcfe;
      --surface-strong: #f8fafc;
    }}
    * {{
      box-sizing: border-box;
    }}
    body {{
      margin: 0;
      padding: 28px 20px 40px;
      font-family: "Trebuchet MS", "Aptos", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(18, 156, 89, 0.08), transparent 32%),
        radial-gradient(circle at top right, rgba(218, 75, 99, 0.08), transparent 28%),
        linear-gradient(180deg, #fbfcff 0%, var(--bg) 100%);
    }}
    a {{
      color: inherit;
    }}
    .dashboard-shell {{
      max-width: 1200px;
      margin: 0 auto;
    }}
    .hero {{
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(247, 250, 253, 0.96) 100%);
      border: 1px solid rgba(198, 209, 222, 0.85);
      border-radius: 28px;
      padding: 28px;
      box-shadow: var(--shadow);
    }}
    .hero-tag {{
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.82);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }}
    .hero-grid {{
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-end;
      margin-top: 18px;
      flex-wrap: wrap;
    }}
    .hero h1 {{
      margin: 0;
      font-size: clamp(34px, 5vw, 48px);
      line-height: 1.02;
      letter-spacing: -0.04em;
    }}
    .hero-copy p {{
      margin: 14px 0 0;
      max-width: 700px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
    }}
    .hero-meta {{
      min-width: 240px;
      padding: 14px 16px;
      border-radius: 20px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.82);
      color: var(--muted);
    }}
    .hero-meta-label {{
      display: block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted-soft);
    }}
    .hero-meta strong {{
      display: block;
      margin-top: 8px;
      color: var(--ink);
      font-size: 14px;
      line-height: 1.45;
      word-break: break-word;
    }}
    .summary-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-top: 22px;
    }}
    .summary-card,
    .metric-card {{
      min-height: 148px;
      padding: 18px;
      border-radius: 24px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.97) 0%, rgba(248, 250, 252, 0.97) 100%);
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
    }}
    .summary-label,
    .metric-label {{
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }}
    .summary-value,
    .metric-value {{
      margin: 14px 0 16px;
      font-size: clamp(26px, 3vw, 32px);
      font-weight: 700;
      letter-spacing: -0.04em;
      line-height: 1;
    }}
    .summary-note,
    .metric-note {{
      display: block;
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }}
    .panel {{
      margin-top: 22px;
      padding: 22px;
      border-radius: 28px;
      border: 1px solid rgba(198, 209, 222, 0.85);
      background: var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }}
    .section-head {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-end;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }}
    .section-kicker {{
      margin: 0 0 8px;
      color: var(--muted-soft);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }}
    .section-head h2 {{
      margin: 0;
      font-size: 28px;
      letter-spacing: -0.04em;
    }}
    .section-head p {{
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.55;
    }}
    .section-count {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 52px;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--surface);
      font-weight: 700;
      font-size: 14px;
      color: var(--ink);
    }}
    .market-cards-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    }}
    .market-card {{
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 100%;
      padding: 20px;
      border-radius: 26px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(248, 250, 252, 0.96) 100%);
      box-shadow: 0 14px 30px rgba(15, 23, 42, 0.05);
    }}
    .market-card-top {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }}
    .market-card-meta {{
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }}
    .market-card-id,
    .market-context {{
      display: inline-flex;
      align-items: center;
      padding: 7px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }}
    .market-card-id {{
      background: var(--surface-strong);
      border: 1px solid var(--line);
      color: var(--muted);
    }}
    .market-context {{
      background: var(--gray-soft);
      border: 1px solid var(--gray-line);
      color: var(--gray);
    }}
    .market-matchup {{
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 10px;
      align-items: center;
    }}
    .team-stack {{
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      min-width: 0;
    }}
    .team-stack-right {{
      align-items: flex-end;
      text-align: right;
    }}
    .team-badge {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 58px;
      height: 58px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, #ffffff 0%, #eff4f8 100%);
      color: var(--ink);
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.04em;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
    }}
    .team-name {{
      font-size: 18px;
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: -0.03em;
      word-break: break-word;
    }}
    .vs-pill {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }}
    .market-question {{
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }}
    .market-metrics {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }}
    .market-empty-state {{
      grid-column: 1 / -1;
    }}
    .table-shell {{
      overflow-x: auto;
    }}
    table {{
      width: 100%;
      min-width: 860px;
      border-collapse: separate;
      border-spacing: 0 12px;
    }}
    th {{
      text-align: left;
      padding: 0 14px 6px;
      color: var(--muted-soft);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }}
    tbody td {{
      padding: 18px 14px;
      vertical-align: top;
      background: var(--panel-strong);
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      font-size: 14px;
    }}
    tbody td:first-child {{
      border-left: 1px solid var(--line);
      border-radius: 20px 0 0 20px;
    }}
    tbody td:last-child {{
      border-right: 1px solid var(--line);
      border-radius: 0 20px 20px 0;
    }}
    .market-id {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 12px;
      border-radius: 999px;
      background: var(--surface-strong);
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }}
    .market-link {{
      color: var(--ink);
      font-size: 15px;
      font-weight: 700;
      line-height: 1.5;
      text-decoration: none;
    }}
    .market-link:hover {{
      color: var(--green);
    }}
    .market-subline {{
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
    }}
    .chip {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      white-space: nowrap;
    }}
    .chip-positive {{
      color: var(--green);
      background: var(--green-soft);
      border-color: var(--green-line);
    }}
    .chip-negative {{
      color: var(--red);
      background: var(--red-soft);
      border-color: var(--red-line);
    }}
    .chip-neutral {{
      color: var(--gray);
      background: var(--gray-soft);
      border-color: var(--gray-line);
    }}
    .chip-info {{
      color: #2559a7;
      background: #eef4ff;
      border-color: #c9dafd;
    }}
    .chip-caution {{
      color: #8f5a11;
      background: #fff5e6;
      border-color: #f4d7a7;
    }}
    .actions {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }}
    .action-link {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 9px 12px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }}
    .action-link:hover {{
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
    }}
    .action-primary {{
      color: #f8fffb;
      background: linear-gradient(180deg, #123d2a 0%, #0f7a43 100%);
      border-color: #0f7a43;
    }}
    .action-secondary {{
      color: var(--ink);
      background: #ffffff;
      border-color: var(--line-strong);
    }}
    .action-secondary:hover {{
      color: var(--green);
      border-color: var(--green-line);
    }}
    .action-disabled {{
      color: var(--gray);
      background: var(--gray-soft);
      border-color: var(--gray-line);
      cursor: default;
      box-shadow: none;
      transform: none;
    }}
    .metric-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
    }}
    .empty-row td {{
      padding: 0;
      background: transparent;
      border: none;
    }}
    .empty-state {{
      padding: 22px 20px;
      border-radius: 24px;
      border: 1px dashed var(--gray-line);
      background: var(--surface-strong);
      color: var(--muted);
      text-align: center;
      font-size: 14px;
      font-style: italic;
    }}
    @media (max-width: 760px) {{
      body {{
        padding: 18px 14px 28px;
      }}
      .hero,
      .panel {{
        padding: 18px;
        border-radius: 24px;
      }}
      table {{
        min-width: 720px;
      }}
    }}
  </style>
</head>
<body>
  <div class="dashboard-shell">
    <section class="hero">
      <span class="hero-tag">PolySignal · panel operativo</span>
      <div class="hero-grid">
        <div class="hero-copy">
          <h1>Panel de PolySignal</h1>
          <p>Vista rápida del sistema, foco en oportunidades y lectura compacta de la evaluación reciente en un formato más cercano a una app de mercados.</p>
        </div>
        <div class="hero-meta">
          <span class="hero-meta-label">Generado el</span>
          <strong>{generated_at}</strong>
        </div>
      </div>
      <div class="summary-grid">
        {summary_cards}
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="section-kicker">Señales activas</p>
          <h2>Mejores oportunidades</h2>
          <p>Mercados con sesgo operativo más claro según la corrida más reciente.</p>
        </div>
        <span class="section-count">{top_rendered}</span>
      </div>
      <div class="market-cards-grid">
        {top_rows}
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="section-kicker">Seguimiento</p>
          <h2>En observación</h2>
          <p>Mercados que siguen valiendo la pena monitorear, aunque aún no suben al bloque prioritario.</p>
        </div>
        <span class="section-count">{watch_rendered}</span>
      </div>
      <div class="market-cards-grid">
        {watch_rows}
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="section-kicker">Resultados</p>
          <h2>Evaluación</h2>
          <p>Lectura rápida del desempeño acumulado sin cambiar ninguna métrica ni recalcular nada nuevo.</p>
        </div>
      </div>
      <div class="metric-grid">
        {evaluation_cards}
      </div>
    </section>
  </div>
</body>
</html>
""".format(
        generated_at=escape(generated_at),
        summary_cards=_render_summary_cards(dashboard, overall_status),
        top_rendered=len(dashboard.top_opportunities),
        watch_rendered=len(dashboard.watchlist),
        top_rows=_render_table_rows(dashboard.top_opportunities),
        watch_rows=_render_table_rows(dashboard.watchlist),
        evaluation_cards=_render_evaluation_cards(dashboard.evaluation),
    )


def write_dashboard_html(
    html: str,
    *,
    output_dir: Path,
    generated_at: datetime | None = None,
) -> dict[str, str]:
    timestamp = generated_at or datetime.now(tz=UTC)
    run_id = timestamp.strftime("%Y%m%d_%H%M%S")
    output_dir.mkdir(parents=True, exist_ok=True)

    html_output_path = output_dir / f"{run_id}.dashboard.html"
    latest_html_path = output_dir / "latest-dashboard.html"

    html_output_path.write_text(html, encoding="utf-8")
    latest_html_path.write_text(html, encoding="utf-8")

    return {
        "run_id": run_id,
        "html_output_path": str(html_output_path),
        "latest_html_path": str(latest_html_path),
    }


def _dashboard_row_from_overview_item(
    item: MarketOverviewItem,
    *,
    evaluation_available: bool,
    market_meta: DashboardMarketMeta,
) -> DashboardTableRow:
    prediction = item.latest_prediction
    return DashboardTableRow(
        market_id=item.market.id,
        question=item.market.question,
        yes_probability=prediction.yes_probability if prediction is not None else None,
        confidence_score=prediction.confidence_score if prediction is not None else None,
        edge_magnitude=prediction.edge_magnitude if prediction is not None else None,
        priority_bucket=item.priority_bucket,
        evaluation_available=evaluation_available,
        market_time_label=market_meta.time_label,
        market_status_label=market_meta.status_label,
        market_status_tone=market_meta.status_tone,
        scoring_mode_label=_translate_scoring_mode(item.scoring_mode),
        scoring_mode_tone=_tone_for_scoring_mode(item.scoring_mode),
    )


def _dashboard_row_from_briefing_item(
    item: BriefingMarketItem,
    *,
    evaluation_available: bool,
    market_meta: DashboardMarketMeta,
) -> DashboardTableRow:
    return DashboardTableRow(
        market_id=item.market_id,
        question=item.question,
        yes_probability=item.yes_probability,
        confidence_score=item.confidence_score,
        edge_magnitude=item.edge_magnitude,
        priority_bucket=item.priority_bucket,
        evaluation_available=evaluation_available,
        market_time_label=market_meta.time_label,
        market_status_label=market_meta.status_label,
        market_status_tone=market_meta.status_tone,
        scoring_mode_label=_translate_scoring_mode(item.scoring_mode),
        scoring_mode_tone=_tone_for_scoring_mode(item.scoring_mode),
    )


def _render_table_rows(rows: list[DashboardTableRow]) -> str:
    if not rows:
        return '<div class="empty-state market-empty-state">No hay mercados disponibles en esta sección.</div>'
    return "\n".join([_render_market_card(row) for row in rows])


def _render_market_card(row: DashboardTableRow) -> str:
    team_a, team_b = _extract_matchup(row.question)
    return (
        '<article class="market-card">'
        '<div class="market-card-top">'
        f'<span class="market-card-id">mercado #{row.market_id}</span>'
        '<div class="market-card-meta">'
        f'{_render_value_chip(row.market_status_label, row.market_status_tone)}'
        f'{_render_value_chip(row.scoring_mode_label, row.scoring_mode_tone)}'
        f'<span class="market-context">{escape(row.market_time_label)}</span>'
        "</div>"
        "</div>"
        '<div class="market-matchup">'
        f'{_render_team_block(team_a)}'
        '<span class="vs-pill">vs</span>'
        f'{_render_team_block(team_b, align="right")}'
        "</div>"
        f'<p class="market-question">{escape(row.question)}</p>'
        '<div class="market-metrics">'
        f'{_render_value_chip(f"sí { _format_decimal(row.yes_probability) }", _tone_for_yes_probability(row.yes_probability))}'
        f'{_render_value_chip(f"confianza { _format_decimal(row.confidence_score) }", _tone_for_confidence(row.confidence_score))}'
        f'{_render_value_chip(f"diferencia { _format_decimal(row.edge_magnitude) }", _tone_for_edge(row.edge_magnitude))}'
        f'{_render_value_chip(_translate_priority_bucket(row.priority_bucket), _tone_for_priority_bucket(row.priority_bucket))}'
        "</div>"
        f'{_render_row_links(row)}'
        "</article>"
    )


def _render_row_links(row: DashboardTableRow) -> str:
    market_path = escape(_market_detail_path(row.market_id))
    references_path = escape(_market_references_path(row.market_id))
    if row.evaluation_available:
        evaluation_path = escape(_market_evaluation_path(row.market_id))
        evaluation_link = (
            f'<a class="action-link action-secondary" href="{evaluation_path}">evaluación</a>'
        )
    else:
        evaluation_link = (
            '<span class="action-link action-disabled">evaluación no disponible</span>'
        )
    return (
        '<div class="actions market-actions">'
        f'<a class="action-link action-primary" href="{market_path}">mercado</a>'
        f'<a class="action-link action-secondary" href="{references_path}">referencias</a>'
        f"{evaluation_link}"
        "</div>"
    )


def _render_team_block(team_name: str, *, align: str = "left") -> str:
    align_class = "team-stack team-stack-right" if align == "right" else "team-stack"
    return (
        f'<div class="{align_class}">'
        f'<span class="team-badge">{escape(_team_initials(team_name))}</span>'
        f'<span class="team-name">{escape(team_name)}</span>'
        "</div>"
    )


def _extract_matchup(question: str) -> tuple[str, str]:
    candidate = question.rsplit(" - ", maxsplit=1)[-1].strip()
    for pattern in (r"\s+vs\.?\s+", r"\s+@\s+", r"\s+at\s+"):
        parts = re.split(pattern, candidate, maxsplit=1, flags=re.IGNORECASE)
        if len(parts) == 2:
            left = _normalize_team_name(parts[0])
            right = _normalize_team_name(parts[1])
            if left and right:
                return left, right
    return "Equipo A", "Equipo B"


def _normalize_team_name(value: str) -> str:
    return " ".join(value.replace("?", "").split())


def _team_initials(team_name: str) -> str:
    words = [word for word in re.split(r"[\s/]+", team_name) if word]
    if not words:
        return "TM"
    return "".join(word[0].upper() for word in words[:2])


def _resolve_market_card_meta(
    db: Session,
    market_id: int,
    *,
    cache: dict[int, DashboardMarketMeta],
) -> DashboardMarketMeta:
    cached = cache.get(market_id)
    if cached is not None:
        return cached

    market = get_market_by_id(db, market_id)
    time_label = "inicio no disponible"
    status_label = "estado no disponible"
    status_tone = "neutral"
    if market is not None:
        if market.event is not None and market.event.start_at is not None:
            time_label = f"empieza: {_format_market_datetime(market.event.start_at)}"
        elif market.end_date is not None:
            time_label = f"cierre: {_format_market_datetime(market.end_date)}"
        elif market.event is not None and market.event.end_at is not None:
            time_label = f"cierre: {_format_market_datetime(market.event.end_at)}"

        if market.closed:
            status_label = "cerrado"
            status_tone = "negative"
        elif market.active and not market.closed:
            status_label = "activo"
            status_tone = "positive"

    meta = DashboardMarketMeta(
        time_label=time_label,
        status_label=status_label,
        status_tone=status_tone,
    )
    cache[market_id] = meta
    return meta


def _format_market_datetime(value: datetime) -> str:
    localized = value.astimezone() if value.tzinfo is not None else value
    month = _spanish_month_abbrev(localized.month)
    hour = localized.strftime("%I").lstrip("0") or "12"
    minute = localized.strftime("%M")
    meridiem = localized.strftime("%p")
    return f"{localized.day:02d} {month} {hour}:{minute} {meridiem}"


def _spanish_month_abbrev(month: int) -> str:
    return {
        1: "ene",
        2: "feb",
        3: "mar",
        4: "abr",
        5: "may",
        6: "jun",
        7: "jul",
        8: "ago",
        9: "sep",
        10: "oct",
        11: "nov",
        12: "dic",
    }.get(month, "mes")


def _render_summary_cards(dashboard: DashboardArtifact, overall_status: str) -> str:
    return "".join(
        [
            _render_summary_card(
                label="estado general",
                value=overall_status,
                tone=_tone_for_status_label(dashboard.overall_status),
                note="lectura del último estado operativo",
            ),
            _render_summary_card(
                label="mejores oportunidades",
                value=str(dashboard.total_top_opportunities),
                tone="positive" if dashboard.total_top_opportunities > 0 else "neutral",
                note="mercados priorizados en la corrida actual",
            ),
            _render_summary_card(
                label="en observación",
                value=str(dashboard.total_watchlist),
                tone="neutral" if dashboard.total_watchlist > 0 else "negative",
                note="mercados útiles para seguimiento",
            ),
            _render_summary_card(
                label="evaluables",
                value=str(dashboard.evaluation.evaluable),
                tone="positive" if dashboard.evaluation.evaluable > 0 else "neutral",
                note="predicciones con outcome ya resuelto",
            ),
        ]
    )


def _render_evaluation_cards(evaluation: EvaluationSummaryResponse) -> str:
    return "".join(
        [
            _render_metric_card(
                label="precisión",
                value=_format_optional_float(evaluation.accuracy),
                tone=_tone_for_accuracy(evaluation.accuracy),
                note="acierto simple sobre predicciones evaluables",
            ),
            _render_metric_card(
                label="precisión en oportunidades",
                value=_format_optional_float(evaluation.opportunity_accuracy),
                tone=_tone_for_accuracy(evaluation.opportunity_accuracy),
                note="solo sobre mercados marcados como oportunidad",
            ),
            _render_metric_card(
                label="puntuación Brier",
                value=_format_optional_float(evaluation.brier_score),
                tone=_tone_for_brier(evaluation.brier_score),
                note="más cerca de 0 implica mejor calibración",
            ),
            _render_metric_card(
                label="evaluables",
                value=str(evaluation.evaluable),
                tone="positive" if evaluation.evaluable > 0 else "neutral",
                note="predicciones ya comparables contra resultado real",
            ),
            _render_metric_card(
                label="pendientes",
                value=str(evaluation.pending),
                tone="negative" if evaluation.pending > 0 else "neutral",
                note="siguen esperando resolución manual o externa",
            ),
        ]
    )


def _render_summary_card(*, label: str, value: str, tone: str, note: str) -> str:
    return (
        '<article class="summary-card">'
        f'<p class="summary-label">{escape(label)}</p>'
        f'<div class="summary-value">{escape(value)}</div>'
        f'{_render_value_chip(_tone_label(tone), tone)}'
        f'<span class="summary-note">{escape(note)}</span>'
        "</article>"
    )


def _render_metric_card(*, label: str, value: str, tone: str, note: str) -> str:
    return (
        '<article class="metric-card">'
        f'<p class="metric-label">{escape(label)}</p>'
        f'<div class="metric-value">{escape(value)}</div>'
        f'{_render_value_chip(_tone_label(tone), tone)}'
        f'<span class="metric-note">{escape(note)}</span>'
        "</article>"
    )


def _render_value_chip(value: str, tone: str) -> str:
    return f'<span class="chip chip-{escape(tone)}">{escape(value)}</span>'


def _tone_label(tone: str) -> str:
    return {
        "positive": "favorable",
        "negative": "desfavorable",
        "neutral": "neutral",
    }.get(tone, "neutral")


def _market_detail_path(market_id: int) -> str:
    return f"/markets/{market_id}"


def _market_evaluation_path(market_id: int) -> str:
    return f"/evaluation/history/{market_id}"


def _market_references_path(market_id: int) -> str:
    return f"/markets/{market_id}/references"


def _tone_for_yes_probability(value: Decimal | None) -> str:
    if value is None:
        return "neutral"
    if value >= Decimal("0.60"):
        return "positive"
    if value <= Decimal("0.40"):
        return "negative"
    return "neutral"


def _tone_for_confidence(value: Decimal | None) -> str:
    if value is None:
        return "neutral"
    if value >= Decimal("0.75"):
        return "positive"
    if value < Decimal("0.50"):
        return "negative"
    return "neutral"


def _tone_for_edge(value: Decimal | None) -> str:
    if value is None:
        return "neutral"
    if value >= Decimal("0.10"):
        return "positive"
    if value < Decimal("0.04"):
        return "negative"
    return "neutral"


def _tone_for_priority_bucket(priority_bucket: str) -> str:
    return {
        "priority": "positive",
        "watchlist": "neutral",
        "review_fallback": "neutral",
        "fallback_only": "negative",
        "no_prediction": "negative",
        "fallback": "negative",
    }.get(priority_bucket, "neutral")


def _tone_for_scoring_mode(scoring_mode: str | None) -> str:
    if scoring_mode == "evidence_backed":
        return "info"
    if scoring_mode == "fallback_only":
        return "caution"
    return "neutral"


def _tone_for_status_label(status: str | None) -> str:
    if status == "ok":
        return "positive"
    if status in {"warning", "error"}:
        return "negative"
    return "neutral"


def _tone_for_accuracy(value: float | None) -> str:
    if value is None:
        return "neutral"
    if value >= 0.60:
        return "positive"
    if value < 0.50:
        return "negative"
    return "neutral"


def _tone_for_brier(value: float | None) -> str:
    if value is None:
        return "neutral"
    if value <= 0.20:
        return "positive"
    if value > 0.35:
        return "negative"
    return "neutral"


def _format_decimal(value: Decimal | None) -> str:
    if value is None:
        return "n/d"
    return f"{value:.4f}"


def _format_optional_float(value: float | None) -> str:
    if value is None:
        return "n/d"
    return f"{value:.4f}"


def _format_datetime(value: datetime | None) -> str:
    if value is None:
        return "n/d"
    return value.isoformat()


def _translate_dashboard_status(status: str | None) -> str:
    if status is None:
        return "n/d"
    return {
        "ok": "ok",
        "warning": "advertencia",
        "error": "error",
        "missing": "faltante",
        "unknown": "desconocido",
    }.get(status, status)


def _translate_priority_bucket(priority_bucket: str) -> str:
    return {
        "priority": "prioridad",
        "watchlist": "observación",
        "review_fallback": "revisión",
        "fallback_only": "solo respaldo",
        "no_prediction": "sin predicción",
        "fallback": "respaldo",
    }.get(priority_bucket, priority_bucket)


def _translate_scoring_mode(scoring_mode: str | None) -> str:
    return {
        "evidence_backed": "con evidencia",
        "fallback_only": "solo mercado",
    }.get(scoring_mode, "modo no disponible")


def _has_market_evaluation(db: Session, market_id: int) -> bool:
    return get_market_outcome(db, market_id) is not None
