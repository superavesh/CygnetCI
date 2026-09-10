"""Data access for Release / ReleasePipeline / ReleaseStage / ReleaseExecution /
Environment, extracted out of release_service.py / pipeline_service.py so those
modules no longer call db.query(...) directly. Mechanical extraction — no query
logic changed."""
from typing import List, Optional

from sqlalchemy.orm import Session

import models


def get_release_pipelines(db: Session, release_id: int) -> List[models.ReleasePipeline]:
    return (
        db.query(models.ReleasePipeline)
        .filter(models.ReleasePipeline.release_id == release_id)
        .order_by(models.ReleasePipeline.order_index)
        .all()
    )


def get_dependent_pipelines(db: Session, depends_on_release_pipeline_id: int) -> List[models.ReleasePipeline]:
    return (
        db.query(models.ReleasePipeline)
        .filter(models.ReleasePipeline.depends_on == depends_on_release_pipeline_id)
        .all()
    )


def get_release_stages(db: Session, release_id: int) -> List[models.ReleaseStage]:
    return (
        db.query(models.ReleaseStage)
        .filter(models.ReleaseStage.release_id == release_id)
        .order_by(models.ReleaseStage.order_index)
        .all()
    )


def count_executions(db: Session, release_id: int) -> int:
    return db.query(models.ReleaseExecution).filter(models.ReleaseExecution.release_id == release_id).count()


def get_execution_by_id(db: Session, release_execution_id: int) -> Optional[models.ReleaseExecution]:
    return db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == release_execution_id).first()


def get_environment(db: Session, environment_id: int) -> Optional[models.Environment]:
    return db.query(models.Environment).filter(models.Environment.id == environment_id).first()


def get_by_id(db: Session, release_id: int) -> Optional[models.Release]:
    return db.query(models.Release).filter(models.Release.id == release_id).first()


def get_stage_execution_by_id(db: Session, stage_execution_id: int) -> Optional[models.StageExecution]:
    return db.query(models.StageExecution).filter(models.StageExecution.id == stage_execution_id).first()


def get_release_stage_by_id(db: Session, release_stage_id: int) -> Optional[models.ReleaseStage]:
    return db.query(models.ReleaseStage).filter(models.ReleaseStage.id == release_stage_id).first()
