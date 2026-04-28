from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.polysignal_score import PolySignalScoreRead
from app.schemas.research import UpcomingDataQualityItemRead


JsonPayload = dict[str, object] | list[object]


class MarketAnalysisParticipant(BaseModel):
    name: str
    role: str
    logo_url: str | None = None
    image_url: str | None = None
    abbreviation: str | None = None


class MarketAnalysisMarket(BaseModel):
    id: int
    polymarket_market_id: str
    event_id: int
    event_title: str | None = None
    event_category: str | None = None
    question: str
    slug: str
    sport_type: str | None = None
    market_type: str | None = None
    evidence_shape: str | None = None
    image_url: str | None = None
    icon_url: str | None = None
    event_image_url: str | None = None
    event_icon_url: str | None = None
    active: bool
    closed: bool
    end_date: datetime | None = None
    rules_text: str | None = None
    created_at: datetime
    updated_at: datetime


class MarketAnalysisSnapshot(BaseModel):
    id: int
    market_id: int
    captured_at: datetime
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    midpoint: Decimal | None = None
    last_trade_price: Decimal | None = None
    spread: Decimal | None = None
    volume: Decimal | None = None
    liquidity: Decimal | None = None

    model_config = ConfigDict(from_attributes=True)


class MarketAnalysisCandidateContext(BaseModel):
    candidate_score: Decimal
    candidate_reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    research_template_name: str
    vertical: str
    sport: str
    market_shape: str
    participants: list[MarketAnalysisParticipant] = Field(default_factory=list)


class MarketAnalysisPrediction(BaseModel):
    id: int
    market_id: int
    prediction_family: str
    research_run_id: int | None = None
    yes_probability: Decimal
    no_probability: Decimal
    confidence_score: Decimal
    edge_signed: Decimal
    edge_magnitude: Decimal
    edge_class: str
    opportunity: bool
    review_confidence: bool
    review_edge: bool
    recommendation: str | None = None
    run_at: datetime
    created_at: datetime


class MarketAnalysisResearchRun(BaseModel):
    id: int
    status: str
    vertical: str
    subvertical: str | None = None
    market_shape: str
    research_mode: str
    model_used: str | None = None
    web_search_used: bool
    degraded_mode: bool
    confidence_score: Decimal | None = None
    total_sources_found: int
    total_sources_used: int
    error_message: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
    metadata_json: JsonPayload | None = None


class MarketAnalysisFinding(BaseModel):
    id: int
    research_run_id: int
    claim: str
    stance: str
    factor_type: str
    evidence_summary: str
    impact_score: Decimal
    credibility_score: Decimal
    freshness_score: Decimal
    source_name: str | None = None
    citation_url: str | None = None
    published_at: datetime | None = None
    metadata_json: JsonPayload | None = None


class MarketAnalysisPredictionReport(BaseModel):
    id: int
    prediction_id: int | None = None
    research_run_id: int | None = None
    thesis: str
    final_reasoning: str
    recommendation: str
    evidence_for: JsonPayload
    evidence_against: JsonPayload
    risks: JsonPayload
    created_at: datetime
    metadata_json: JsonPayload | None = None


class MarketAnalysisEvidenceItem(BaseModel):
    id: int
    provider: str
    evidence_type: str
    stance: str
    strength: Decimal | None = None
    confidence: Decimal | None = None
    summary: str
    high_contradiction: bool
    bookmaker_count: int | None = None
    source_name: str | None = None
    title: str | None = None
    url: str | None = None
    citation_url: str | None = None
    published_at: datetime | None = None
    fetched_at: datetime | None = None
    metadata_json: JsonPayload | None = None


class MarketAnalysisExternalSignal(BaseModel):
    id: int
    source: str
    source_market_id: str | None = None
    source_event_id: str | None = None
    source_ticker: str | None = None
    title: str | None = None
    yes_probability: Decimal | None = None
    no_probability: Decimal | None = None
    mid_price: Decimal | None = None
    last_price: Decimal | None = None
    best_yes_bid: Decimal | None = None
    best_yes_ask: Decimal | None = None
    best_no_bid: Decimal | None = None
    best_no_ask: Decimal | None = None
    spread: Decimal | None = None
    volume: Decimal | None = None
    liquidity: Decimal | None = None
    open_interest: Decimal | None = None
    source_confidence: Decimal | None = None
    match_confidence: Decimal | None = None
    match_reason: str | None = None
    warnings: JsonPayload | None = None
    fetched_at: datetime
    created_at: datetime


class MarketAnalysisRead(BaseModel):
    market: MarketAnalysisMarket
    latest_snapshot: MarketAnalysisSnapshot | None = None
    polysignal_score: PolySignalScoreRead | None = None
    data_quality: UpcomingDataQualityItemRead | None = None
    candidate_context: MarketAnalysisCandidateContext | None = None
    latest_prediction: MarketAnalysisPrediction | None = None
    prediction_history: list[MarketAnalysisPrediction] = Field(default_factory=list)
    research_runs: list[MarketAnalysisResearchRun] = Field(default_factory=list)
    research_findings: list[MarketAnalysisFinding] = Field(default_factory=list)
    prediction_reports: list[MarketAnalysisPredictionReport] = Field(default_factory=list)
    evidence_items: list[MarketAnalysisEvidenceItem] = Field(default_factory=list)
    external_signals: list[MarketAnalysisExternalSignal] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
