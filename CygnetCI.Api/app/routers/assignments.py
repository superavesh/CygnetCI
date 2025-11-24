from fastapi import APIRouter, Depends
from ..database import get_db
from .. import crud, schemas
from ..deps import get_current_user

router = APIRouter(tags=["assignments"])

def get_db_sync():
    return next(get_db())

@router.post("/assignments/", response_model=schemas.AssignmentOut)
def assign_role(assign_in: schemas.AssignmentCreate, current=Depends(get_current_user)):
    db = get_db_sync()
    return crud.assign_role(db, assign_in)

@router.put("/assignments/{assignment_id}", response_model=schemas.AssignmentOut)
def edit_assignment(assignment_id: int, payload: dict, current=Depends(get_current_user)):
    db = get_db_sync()
    new_role = payload.get("role_id")
    return crud.edit_assignment(db, assignment_id, new_role)

@router.delete("/assignments/{assignment_id}")
def delete_assignment(assignment_id: int, current=Depends(get_current_user)):
    db = get_db_sync()
    crud.delete_assignment(db, assignment_id)
    return {"ok": True}
