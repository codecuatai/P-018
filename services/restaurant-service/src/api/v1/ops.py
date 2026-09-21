from fastapi import APIRouter, Depends, Query, Request

from src.api.auth import require_service_auth
from src.api.v1.restaurants import envelope

router = APIRouter(prefix="/internal/ops", tags=["Internal operations"])


@router.get("/summary")
def summary(request: Request, _auth=Depends(require_service_auth)):
    return envelope(request.app.state.restaurant_service.ops_summary(), request)


@router.get("/dataset-status")
def dataset_status(request: Request, _auth=Depends(require_service_auth)):
    return envelope(request.app.state.restaurant_service.ops_dataset_status(), request)


@router.get("/transactions")
def transactions(request: Request, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), _auth=Depends(require_service_auth)):
    return envelope(request.app.state.restaurant_service.ops_transactions(limit, offset), request)
