from __future__ import annotations

import argparse
import json
import sys

from app.db.session import SessionLocal
from app.services.research.candidate_selector import ResearchCandidate, list_research_candidates


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Lista mercados candidatos para research sin ejecutar research."
    )
    parser.add_argument("--limit", type=int, default=10, help="Cantidad de candidatos a listar.")
    parser.add_argument("--vertical", default=None, help="Filtro opcional de vertical.")
    parser.add_argument("--sport", default=None, help="Filtro opcional de deporte.")
    parser.add_argument(
        "--market-shape",
        default=None,
        help="Filtro opcional de market shape.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    args = parser.parse_args()

    try:
        with SessionLocal() as db:
            candidates = list_research_candidates(
                db,
                limit=args.limit,
                vertical=args.vertical,
                sport=args.sport,
                market_shape=args.market_shape,
            )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "error",
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                },
                indent=2,
                ensure_ascii=True,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1) from exc

    if args.json:
        print(
            json.dumps(
                {
                    "status": "ok",
                    "count": len(candidates),
                    "candidates": [candidate.to_payload() for candidate in candidates],
                },
                indent=2,
                ensure_ascii=True,
            )
        )
        return

    print(_format_candidates_table(candidates))


def _format_candidates_table(candidates: list[ResearchCandidate]) -> str:
    if not candidates:
        return "No research candidates found."

    lines = [
        "score\tmarket_id\tsport\tshape\tyes\tliquidity\tvolume\ttemplate\tquestion",
    ]
    for candidate in candidates:
        lines.append(
            "\t".join(
                [
                    str(candidate.candidate_score),
                    str(candidate.market_id),
                    candidate.sport,
                    candidate.market_shape,
                    str(candidate.market_yes_price),
                    str(candidate.liquidity),
                    str(candidate.volume),
                    candidate.research_template_name,
                    candidate.question,
                ]
            )
        )
    return "\n".join(lines)


if __name__ == "__main__":
    main()
