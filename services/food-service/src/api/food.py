from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from src.application.food_service import FoodApplicationService
from src.config import get_settings
from src.models.schemas import (
    AddCartItemRequest,
    CancelOrderRequest,
    CreateCartRequest,
    CreateOrderRequest,
    DeliveryQuoteRequest,
    PreviewOrderRequest,
    SearchQuery,
    TransitionOrderRequest,
    UpdateCartItemRequest,
    VoucherRequest,
)

router = APIRouter(prefix="/api/v1", tags=["food"])


def service(request: Request) -> FoodApplicationService:
    return request.app.state.food_service


def require_internal(x_internal_service_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_service_token
    if x_internal_service_token != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "detail": "Internal service authentication required."})


def require_actor(x_internal_service_token: str | None = Header(default=None), x_actor_id: str | None = Header(default=None)) -> str:
    require_internal(x_internal_service_token)
    if not x_actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "detail": "Actor assertion required."})
    return x_actor_id


@router.get("/restaurants", dependencies=[Depends(require_internal)])
async def restaurants(query: SearchQuery = Depends(), food: FoodApplicationService = Depends(service)):
    results = await food.search(**query.model_dump())
    grouped: dict[str, dict] = {}
    for result in results:
        restaurant = result["restaurant"]
        grouped.setdefault(restaurant["id"], {**restaurant, "matching_items": []})["matching_items"].append(result["item"])
    return {"data": list(grouped.values())}


@router.get("/restaurants/{restaurant_id}", dependencies=[Depends(require_internal)])
async def restaurant(restaurant_id: str, food: FoodApplicationService = Depends(service)):
    return {"data": await food.restaurant(restaurant_id)}


@router.get("/restaurants/{restaurant_id}/menu", dependencies=[Depends(require_internal)])
async def menu(restaurant_id: str, food: FoodApplicationService = Depends(service)):
    return {"data": await food.menu(restaurant_id)}


@router.get("/menu-items/{menu_item_id}", dependencies=[Depends(require_internal)])
async def menu_item(menu_item_id: str, food: FoodApplicationService = Depends(service)):
    return {"data": await food.menu_item(menu_item_id)}


@router.get("/food/search", dependencies=[Depends(require_internal)])
async def search(query: SearchQuery = Depends(), food: FoodApplicationService = Depends(service)):
    return {"data": await food.search(**query.model_dump())}


@router.post("/carts")
async def create_cart(payload: CreateCartRequest, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"), actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    if actor_id != payload.user_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "detail": "Actor does not match cart owner."})
    if not idempotency_key:
        raise HTTPException(status_code=422, detail={"code": "IDEMPOTENCY_KEY_REQUIRED", "detail": "Idempotency-Key is required."})
    return {"data": await food.create_cart(actor_id, payload.restaurant_id, idempotency_key)}


@router.get("/carts/{cart_id}")
async def get_cart(cart_id: str, user_id: str | None = None, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    if user_id is not None and user_id != actor_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "detail": "Actor does not match cart owner."})
    return {"data": await food.get_cart(cart_id, actor_id)}


@router.post("/carts/{cart_id}/items")
async def add_item(cart_id: str, payload: AddCartItemRequest, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    return {"data": await food.add_item(cart_id, payload.model_dump(), actor_id)}


@router.patch("/carts/{cart_id}/items/{cart_item_id}")
async def update_item(cart_id: str, cart_item_id: str, payload: UpdateCartItemRequest, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    return {"data": await food.update_item(cart_id, cart_item_id, payload.model_dump(exclude_none=True), actor_id)}


@router.delete("/carts/{cart_id}/items/{cart_item_id}")
async def remove_item(cart_id: str, cart_item_id: str, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    return {"data": await food.remove_item(cart_id, cart_item_id, actor_id)}


@router.post("/carts/{cart_id}/voucher")
async def apply_voucher(cart_id: str, payload: VoucherRequest, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    return {"data": await food.apply_voucher(cart_id, payload.code, actor_id)}


@router.delete("/carts/{cart_id}/voucher")
async def remove_voucher(cart_id: str, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    return {"data": await food.remove_voucher(cart_id, actor_id)}


@router.post("/delivery/quote")
async def delivery_quote(payload: DeliveryQuoteRequest, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    return {"data": await food.delivery_quote(payload.restaurant_id, payload.address_id, actor_id)}


@router.post("/orders/preview")
async def preview(payload: PreviewOrderRequest, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    if actor_id != payload.user_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "detail": "Actor does not match order owner."})
    return {"data": await food.preview_order(payload.cart_id, payload.address_id, payload.user_id)}


@router.post("/orders", dependencies=[Depends(require_internal)])
async def create_order(payload: CreateOrderRequest, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    if actor_id != payload.user_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "detail": "Actor does not match order owner."})
    return {"data": await food.create_order(payload.model_dump())}


@router.get("/orders/{order_id}")
async def get_order(order_id: str, user_id: str | None = None, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    if user_id is not None and user_id != actor_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "detail": "Actor does not match order owner."})
    return {"data": await food.get_order(order_id, actor_id)}


@router.get("/orders/{order_id}/tracking")
async def tracking(order_id: str, user_id: str | None = None, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    if user_id is not None and user_id != actor_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "detail": "Actor does not match order owner."})
    return {"data": await food.tracking(order_id, actor_id)}


@router.post("/orders/{order_id}/cancel-preview")
async def cancel_preview(order_id: str, user_id: str | None = None, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    if user_id is not None and user_id != actor_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "detail": "Actor does not match order owner."})
    return {"data": await food.cancel_preview(order_id, actor_id)}


@router.post("/orders/{order_id}/cancel")
async def cancel(order_id: str, payload: CancelOrderRequest, actor_id: str = Depends(require_actor), food: FoodApplicationService = Depends(service)):
    if actor_id != payload.user_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "detail": "Actor does not match order owner."})
    return {"data": await food.cancel(order_id, payload.user_id, payload.idempotency_key)}


@router.post("/internal/orders/{order_id}/transition", dependencies=[Depends(require_internal)])
async def transition(order_id: str, payload: TransitionOrderRequest, idempotency_key: str | None = Header(default=None), food: FoodApplicationService = Depends(service)):
    return {"data": await food.transition_order(order_id, payload.target_status, payload.reason, payload.operation_key or idempotency_key)}
