from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.clients.polymarket_data import PolymarketDataClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.wallet_analysis import WalletAnalysisJobNotFoundError, serialize_wallet_analysis_job
from app.services.wallet_analysis_runner import (
    WalletAnalysisRunnerConfig,
    WalletAnalysisRunnerError,
    run_wallet_analysis_job_once,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Ejecuta una pasada controlada del runner de wallet analysis por job.",
    )
    parser.add_argument("--once", action="store_true", help="Ejecuta una sola pasada del runner.")
    parser.add_argument("--job-id", required=True, help="ID del wallet_analysis_job a procesar.")
    parser.add_argument("--max-wallets", type=int, default=100, help="Maximo de wallets a analizar en esta pasada.")
    parser.add_argument(
        "--max-wallets-discovery",
        type=int,
        default=150,
        help="Maximo de wallets a descubrir antes de cortar discovery.",
    )
    parser.add_argument("--batch-size", type=int, default=20, help="Tamano del lote por pasada.")
    parser.add_argument("--history-limit", type=int, default=100, help="Limite por wallet para historial publico.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    if not args.once:
        parser.error("Este comando solo soporta --once en este sprint.")

    session: Session = SessionLocal()
    data_client = PolymarketDataClient.from_settings(get_settings())
    try:
        job = run_wallet_analysis_job_once(
            session,
            job_id=args.job_id,
            data_client=data_client,
            config=WalletAnalysisRunnerConfig(
                batch_size=max(1, args.batch_size),
                max_wallets_analyze=max(1, args.max_wallets),
                max_wallets_discovery=max(1, args.max_wallets_discovery),
                user_history_limit=max(1, args.history_limit),
            ),
        )
        session.commit()
        session.refresh(job)
        payload = serialize_wallet_analysis_job(
            job,
            candidates_count=len(job.candidates),
        ).model_dump(mode="json")
        sys.stdout.write(json.dumps(payload) + "\n")
        return 0
    except WalletAnalysisRunnerError as exc:
        session.commit()
        sys.stderr.write(
            json.dumps(
                {
                    "error": "wallet_analysis_runner_failed",
                    "job_id": args.job_id,
                    "detail": " ".join(str(exc).split())[:400],
                }
            )
            + "\n"
        )
        return 1
    except WalletAnalysisJobNotFoundError:
        sys.stderr.write(json.dumps({"error": "wallet_analysis_job_not_found", "job_id": args.job_id}) + "\n")
        session.rollback()
        return 1
    except Exception as exc:
        session.rollback()
        sys.stderr.write(json.dumps({"error": "wallet_analysis_runner_failed", "detail": " ".join(str(exc).split())[:400]}) + "\n")
        return 1
    finally:
        try:
            data_client.close()
        finally:
            session.close()


if __name__ == "__main__":
    raise SystemExit(main())
