from fastapi import APIRouter, Depends, HTTPException
from ..database import get_db
from .. import crud, schemas
from ..deps import get_current_user

router = APIRouter(tags=["roles"])

def get_db_sync():
    return next(get_db())

@router.post("/roles/", response_model=schemas.RoleOut)
def create_role(role_in: schemas.RoleCreate, current=Depends(get_current_user)):
    db = get_db_sync()
    return crud.create_role(db, role_in)

@router.put("/roles/{role_id}", response_model=schemas.RoleOut)
def update_role(role_id: int, role_update: schemas.RoleUpdate, current=Depends(get_current_user)):
    db = get_db_sync()
    data = role_update.dict(exclude_unset=True)
    return crud.update_role(db, role_id, data)

@router.delete("/roles/{role_id}")
def delete_role(role_id: int, current=Depends(get_current_user)):
    db = get_db_sync()
    crud.delete_role(db, role_id)
    return {"ok": True}
