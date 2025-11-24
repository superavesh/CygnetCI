from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import crud, schemas
from ..deps import get_current_user

router = APIRouter(tags=["users"])

def get_db_sync():
    return next(get_db())

@router.post("/users/", response_model=schemas.UserOut)
def create_user(user_in: schemas.UserCreate):
    db = get_db_sync()
    existing = crud.get_user_by_username(db, user_in.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    return crud.create_user(db, user_in)

@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, user_update: schemas.UserUpdate, current=Depends(get_current_user)):
    db = get_db_sync()
    data = user_update.dict(exclude_unset=True)
    return crud.update_user(db, user_id, data)

@router.delete("/users/{user_id}")
def delete_user(user_id: int, current=Depends(get_current_user)):
    db = get_db_sync()
    crud.delete_user(db, user_id)
    return {"ok": True}
