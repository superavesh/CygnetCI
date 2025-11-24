from fastapi import APIRouter, Depends
from ..database import get_db
from .. import crud, schemas
from ..deps import get_current_user

router = APIRouter(tags=["pipelines"])

def get_db_sync():
    return next(get_db())

@router.post("/pipelines/", response_model=schemas.PipelineOut)
def add_pipeline(p: schemas.PipelineCreate, current=Depends(get_current_user)):
    db = get_db_sync()
    return crud.create_pipeline(db, p)

@router.put("/pipelines/{pipeline_id}", response_model=schemas.PipelineOut)
def modify_pipeline(pipeline_id: int, p: schemas.PipelineUpdate, current=Depends(get_current_user)):
    db = get_db_sync()
    data = p.dict(exclude_unset=True)
    return crud.update_pipeline(db, pipeline_id, data)

@router.delete("/pipelines/{pipeline_id}")
def delete_pipeline(pipeline_id: int, current=Depends(get_current_user)):
    db = get_db_sync()
    crud.delete_pipeline(db, pipeline_id)
    return {"ok": True}
