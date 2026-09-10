"""Data access for the Agent table, extracted out of release_service.py /
pipeline_service.py so those modules no longer call db.query(...) directly.
Mechanical extraction — no query logic changed."""
from typing import Optional

from sqlalchemy.orm import Session

import models


def get_by_id(db: Session, agent_id: int) -> Optional[models.Agent]:
    return db.query(models.Agent).filter(models.Agent.id == agent_id).first()
