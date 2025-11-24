from fastapi import APIRouter, Depends
from ..database import get_db
from .. import crud, schemas
from ..deps import get_current_user

router = APIRouter(tags=["scripts"])

def get_db_sync():
    return next(get_db())

@router.post("/scripts/", response_model=schemas.ScriptOut)
def create_script(script: schemas.ScriptCreate, current=Depends(get_current_user)):
    db = get_db_sync()
    return crud.create_script(db, script)
