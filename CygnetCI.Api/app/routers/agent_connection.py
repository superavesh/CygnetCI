from fastapi import APIRouter, Depends
from ..database import get_db
from .. import crud
from ..deps import get_current_user

router = APIRouter(tags=["agent_connection"])

def get_db_sync():
    return next(get_db())

@router.post("/agent-connection/connect")
def connect_endpoint(payload: dict, current=Depends(get_current_user)):
    db = get_db_sync()
    obj = crud.create_agent_connection(db, payload)
    return obj

@router.post("/agent-connection/health-check")
def unique_health_check(payload: dict, current=Depends(get_current_user)):
    # stub
    return {"ok": True, "payload": payload}
