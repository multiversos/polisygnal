from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.clients.polymarket_data import PolymarketDataClient, get_polymarket_data_client
from app.db.session import get_db
from app.schemas.copy_trading import (
    CopyBotEventRead,
    CopyTradingEventsResponse,
    CopyTradingListResponse,
    CopyTradingOrdersResponse,
    CopyTradingStatusResponse,
    CopyTradingTickResponse,
    CopyTradingTradesResponse,
    CopyWalletCreate,
    CopyWalletRead,
    CopyWalletUpdate,
)
from app.services.copy_trading_demo_engine import run_demo_tick, scan_copy_wallet
from app.services.copy_trading_service import (
    CopyWalletNotFoundError,
    DuplicateCopyWalletError,
    InvalidCopyWalletInputError,
    build_copy_order_read,
    build_copy_trading_status,
    build_copy_trade_read,
    build_copy_wallet_read,
    create_copy_wallet,
    delete_copy_wallet,
    get_copy_wallet,
    list_copy_events,
    list_copy_orders,
    list_copy_trades,
    list_copy_wallets,
    update_copy_wallet,
)

router = APIRouter(prefix="/copy-trading", tags=["copy-trading"])


@router.get("/status", response_model=CopyTradingStatusResponse)
def get_copy_trading_status(db: Session = Depends(get_db)) -> CopyTradingStatusResponse:
    return build_copy_trading_status(db)


@router.get("/wallets", response_model=CopyTradingListResponse)
def get_copy_wallets(db: Session = Depends(get_db)) -> CopyTradingListResponse:
    return CopyTradingListResponse(
        wallets=[build_copy_wallet_read(wallet) for wallet in list_copy_wallets(db)]
    )


@router.post("/wallets", response_model=CopyWalletRead, status_code=status.HTTP_201_CREATED)
def post_copy_wallet(
    payload: CopyWalletCreate,
    db: Session = Depends(get_db),
) -> CopyWalletRead:
    try:
        wallet = create_copy_wallet(db, payload)
    except InvalidCopyWalletInputError as exc:
        raise _bad_request(str(exc)) from exc
    except DuplicateCopyWalletError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    db.commit()
    return build_copy_wallet_read(wallet)


@router.patch("/wallets/{wallet_id}", response_model=CopyWalletRead)
def patch_copy_wallet(
    wallet_id: str,
    payload: CopyWalletUpdate,
    db: Session = Depends(get_db),
) -> CopyWalletRead:
    try:
        wallet = update_copy_wallet(db, wallet_id, payload)
    except CopyWalletNotFoundError as exc:
        raise _not_found(exc.wallet_id) from exc
    except InvalidCopyWalletInputError as exc:
        raise _bad_request(str(exc)) from exc
    db.commit()
    return build_copy_wallet_read(wallet)


@router.delete("/wallets/{wallet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_copy_wallet_route(
    wallet_id: str,
    db: Session = Depends(get_db),
) -> Response:
    try:
        delete_copy_wallet(db, wallet_id)
    except CopyWalletNotFoundError as exc:
        raise _not_found(exc.wallet_id) from exc
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/trades", response_model=CopyTradingTradesResponse)
def get_copy_trades(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> CopyTradingTradesResponse:
    return CopyTradingTradesResponse(
        trades=[
            build_copy_trade_read(
                trade,
                copy_window_seconds=trade.wallet.max_delay_seconds if trade.wallet is not None else None,
            )
            for trade in list_copy_trades(db, limit=limit)
        ]
    )


@router.get("/orders", response_model=CopyTradingOrdersResponse)
def get_copy_orders(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> CopyTradingOrdersResponse:
    return CopyTradingOrdersResponse(
        orders=[
            build_copy_order_read(
                order,
                copy_window_seconds=(
                    order.wallet.max_delay_seconds
                    if order.wallet is not None and order.detected_trade is not None
                    else None
                ),
                source_timestamp=order.detected_trade.source_timestamp if order.detected_trade is not None else None,
            )
            for order in list_copy_orders(db, limit=limit)
        ]
    )


@router.get("/events", response_model=CopyTradingEventsResponse)
def get_copy_events(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> CopyTradingEventsResponse:
    return CopyTradingEventsResponse(
        events=[CopyBotEventRead.model_validate(event) for event in list_copy_events(db, limit=limit)]
    )


@router.post("/wallets/{wallet_id}/scan", response_model=CopyTradingTickResponse)
def post_copy_wallet_scan(
    wallet_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    data_client: PolymarketDataClient = Depends(get_polymarket_data_client),
) -> CopyTradingTickResponse:
    try:
        get_copy_wallet(db, wallet_id)
        response = scan_copy_wallet(db, wallet_id=wallet_id, data_client=data_client, limit=limit)
    except CopyWalletNotFoundError as exc:
        raise _not_found(exc.wallet_id) from exc
    db.commit()
    return response


@router.post("/demo/tick", response_model=CopyTradingTickResponse)
def post_copy_trading_demo_tick(
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    data_client: PolymarketDataClient = Depends(get_polymarket_data_client),
) -> CopyTradingTickResponse:
    response = run_demo_tick(db, data_client=data_client, limit=limit)
    db.commit()
    return response


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _not_found(wallet_id: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Copy wallet {wallet_id} no encontrada.",
    )
