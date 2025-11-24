from fastapi import APIRouter, Depends, HTTPException
from ..database import get_db
from .. import crud, schemas
from ..deps import get_current_user

router = APIRouter(tags=["agents"])

def get_db_sync():
    return next(get_db())

@router.post("/agents/", response_model=schemas.AgentOut)
def add_agent(a: schemas.AgentCreate, current=Depends(get_current_user)):
    db = get_db_sync()
    return crud.create_agent(db, a)

@router.put("/agents/{agent_id}", response_model=schemas.AgentOut)
def modify_agent(agent_id: int, a: schemas.AgentUpdate, current=Depends(get_current_user)):
    db = get_db_sync()
    data = a.dict(exclude_unset=True)
    return crud.update_agent(db, agent_id, data)

@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: int, current=Depends(get_current_user)):
    db = get_db_sync()
    crud.delete_agent(db, agent_id)
    return {"ok": True}

@router.get("/agents/{agent_id}/health")
def agent_health_check(agent_id: int, current=Depends(get_current_user)):
    db = get_db_sync()
    agent = crud.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    # stub: in real system ping agent endpoint
    return {"ok": True, "agent_id": agent_id, "status": "healthy"}
