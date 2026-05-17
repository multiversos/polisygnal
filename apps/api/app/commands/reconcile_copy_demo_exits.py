from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict

from app.db.session import SessionLocal
from app.services.copy_trading_demo_reconciliation import reconcile_open_demo_positions


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Revisa cierres demo pendientes a partir de SELL detectados de la wallet seguida."
    )
    parser.add_argument("--limit", type=int, default=250, help="Maximo de posiciones demo abiertas a revisar.")
    parser.add_argument("--sample", type=int, default=10, help="Maximo de coincidencias a incluir en la muestra.")
    parser.add_argument("--dry-run", action="store_true", help="No modifica la base de datos.")
    parser.add_argument("--apply", action="store_true", help="Cierra posiciones demo reconciliables.")
    parser.add_argument(
        "--yes-i-understand-this-closes-demo-positions",
        action="store_true",
        dest="confirm_apply",
        help="Confirmacion explicita requerida para --apply.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    dry_run = args.dry_run or not args.apply
    if args.apply and not args.confirm_apply:
        parser.error("--apply requiere --yes-i-understand-this-closes-demo-positions")

    with SessionLocal() as session:
        summary = reconcile_open_demo_positions(
            session,
            dry_run=dry_run,
            apply=args.apply,
            confirmed=args.confirm_apply,
            limit=args.limit,
            sample_limit=args.sample,
        )
        if args.apply:
            session.commit()
        else:
            session.rollback()

    print(json.dumps(asdict(summary), ensure_ascii=True, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
