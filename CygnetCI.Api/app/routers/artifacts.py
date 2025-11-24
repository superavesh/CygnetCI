from fastapi import APIRouter, Depends
from ..database import get_db
from .. import crud, schemas
from ..deps import get_current_user

router = APIRouter(tags=["artifacts"])

def get_db_sync():
    return next(get_db())

@router.post("/artifacts/", response_model=schemas.ArtifactOut)
def create_artifact(art: schemas.ArtifactCreate, current=Depends(get_current_user)):
    db = get_db_sync()
    return crud.create_artifact(db, art)
