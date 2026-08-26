"""Task endpoints (UI). Agent task-execution endpoints are added in a later pass."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
from enums import TaskStatus
from formatters import format_task
from deps import require_permission

router = APIRouter(tags=["🌐 UI - Tasks"])


@router.get("/tasks")
def get_tasks(
    status: Optional[TaskStatus] = None,
    agent_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("tasks", "read")),
):
    """Get all tasks with optional filtering"""
    query = db.query(models.Task)

    if status:
        query = query.filter(models.Task.status == status.value)
    if agent_id:
        query = query.filter(models.Task.agent_id == agent_id)

    tasks = query.order_by(models.Task.created_at.desc()).all()
    return [format_task(task) for task in tasks]


@router.get("/tasks/{task_id}")
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("tasks", "read")),
):
    """Get task by ID"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return format_task(task)


@router.delete("/tasks/{task_id}")
def cancel_task(
    task_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("tasks", "delete")),
):
    """Cancel a task"""
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    db_task.status = "failed"
    db.commit()

    return {"success": True, "message": "Task cancelled"}
