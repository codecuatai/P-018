from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from src.application.restaurant_service import RestaurantApplicationService
from src.models.schemas import (
    AvailabilityCheckRequest,
    AvailabilityCheckResponse,
    RestaurantListResponse,
    RestaurantResponse,
)

router = APIRouter(prefix="/restaurants", tags=["Restaurants"])
_service = RestaurantApplicationService()


@router.get("", response_model=RestaurantListResponse)
def search_restaurants(
    location: Optional[str] = Query(None, description="Filter by location/city"),
    cuisine_type: Optional[str] = Query(None, description="Filter by cuisine type"),
    budget_range: Optional[str] = Query(None, description="Filter by budget range ($, $$, $$$)"),
):
    results = _service.search_restaurants(location=location, cuisine_type=cuisine_type, budget_range=budget_range)
    items = [RestaurantResponse(**r.model_dump()) for r in results]
    return RestaurantListResponse(items=items, total=len(items))


@router.get("/{restaurant_id}", response_model=RestaurantResponse)
def get_restaurant(restaurant_id: str):
    restaurant = _service.get_restaurant(restaurant_id)
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{restaurant_id}' not found"
        )
    return RestaurantResponse(**restaurant.model_dump())


@router.post("/{restaurant_id}/availability", response_model=AvailabilityCheckResponse)
def check_availability(restaurant_id: str, request: AvailabilityCheckRequest):
    result = _service.check_availability(
        restaurant_id=restaurant_id,
        party_size=request.party_size,
        booking_time=request.booking_time
    )
    return AvailabilityCheckResponse(**result.model_dump())
