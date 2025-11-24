from fastapi import APIRouter, Depends
from ..database import get_db
from .. import crud, schemas
from ..deps import get_current_user

router = APIRouter(tags=["monitoring"])

def get_db_sync():
    return next(get_db())

@router.post("/monitoring/logs", response_model=schemas.MonitoringOut)
def post_log(l: schemas.MonitoringCreate, current=Depends(get_current_user)):
    db = get_db_sync()
    return crud.create_monitoring(db, l)

@router.get("/monitoring/ping")
def ping_test():
    return {"ok": True, "message": "pong"}
