from fastapi import APIRouter, Depends
from ..database import get_db
from .. import crud, schemas
from ..deps import get_current_user

router = APIRouter(tags=["rights"])

def get_db_sync():
    return next(get_db())

@router.post("/rights/", response_model=schemas.RightOut)
def create_right(right_in: schemas.RightCreate, current=Depends(get_current_user)):
    db = get_db_sync()
    return crud.create_right(db, right_in)

@router.delete("/rights/{right_id}")
def delete_right(right_id: int, current=Depends(get_current_user)):
    db = get_db_sync()
    crud.delete_right(db, right_id)
    return {"ok": True}
