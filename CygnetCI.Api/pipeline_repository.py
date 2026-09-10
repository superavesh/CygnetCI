"""Data access for Pipeline / PipelineExecution, extracted out of
release_service.py / pipeline_service.py so those modules no longer call
db.query(...) directly. Mechanical extraction — no query logic changed."""
from typing import List, Optional

from sqlalchemy.orm import Session

import models


def get_by_id(db: Session, pipeline_id: int) -> Optional[models.Pipeline]:
    return db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()


def get_execution_by_id(db: Session, execution_id: int) -> Optional[models.PipelineExecution]:
    return db.query(models.PipelineExecution).filter(models.PipelineExecution.id == execution_id).first()


def get_pending_execution_for_node(
    db: Session, release_execution_id: int, release_pipeline_id: int
) -> Optional[models.PipelineExecution]:
    return (
        db.query(models.PipelineExecution)
        .filter(
            models.PipelineExecution.release_execution_id == release_execution_id,
            models.PipelineExecution.release_pipeline_id == release_pipeline_id,
            models.PipelineExecution.status == "pending",
        )
        .first()
    )


def get_executions_for_release(db: Session, release_execution_id: int) -> List[models.PipelineExecution]:
    return (
        db.query(models.PipelineExecution)
        .filter(models.PipelineExecution.release_execution_id == release_execution_id)
        .all()
    )


def get_executions_by_trigger_and_window(
    db: Session, triggered_by, started_at_from, started_at_to
) -> List[models.PipelineExecution]:
    return (
        db.query(models.PipelineExecution)
        .filter(models.PipelineExecution.triggered_by == triggered_by)
        .filter(models.PipelineExecution.started_at >= started_at_from)
        .filter(models.PipelineExecution.started_at <= started_at_to)
        .all()
    )


def get_active_pickup_for_execution(
    db: Session, pipeline_execution_id: int, statuses: List[str]
) -> Optional[models.PipelinePickup]:
    return (
        db.query(models.PipelinePickup)
        .filter(models.PipelinePickup.pipeline_execution_id == pipeline_execution_id)
        .filter(models.PipelinePickup.status.in_(statuses))
        .first()
    )


def get_all_running_executions(db: Session) -> List[models.PipelineExecution]:
    return db.query(models.PipelineExecution).filter(models.PipelineExecution.status == "running").all()


def get_latest_running_execution(db: Session, pipeline_id: int) -> Optional[models.PipelineExecution]:
    return (
        db.query(models.PipelineExecution)
        .filter(models.PipelineExecution.pipeline_id == pipeline_id)
        .filter(models.PipelineExecution.status == "running")
        .order_by(models.PipelineExecution.started_at.desc())
        .first()
    )


def get_last_log_for_execution(db: Session, pipeline_execution_id: int) -> Optional[models.PipelineExecutionLog]:
    return (
        db.query(models.PipelineExecutionLog)
        .filter(models.PipelineExecutionLog.pipeline_execution_id == pipeline_execution_id)
        .order_by(models.PipelineExecutionLog.timestamp.desc())
        .first()
    )
