"""Settings endpoints: alert thresholds (consumed by the mobile app; edited in the web UI)."""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from deps import require_superuser

router = APIRouter(tags=["⚙️ Settings"])


class AlertThresholds(BaseModel):
    cpu: int = 90
    memory: int = 90
    disk: int = 90


@router.get("/settings/alert-thresholds")
def get_alert_thresholds(db: Session = Depends(get_db)):
    """Current CPU/RAM/disk alert thresholds (defaults to 90). Any authenticated user."""
    result = {"cpu": 90, "memory": 90, "disk": 90}
    row = db.query(models.AppSetting).filter(models.AppSetting.key == "alert_thresholds").first()
    raw = row.value if row and row.value is not None else ""
    if raw:
        try:
            data = json.loads(raw)
            for k in result:
                v = data.get(k)
                if isinstance(v, (int, float)):
                    result[k] = int(v)
        except Exception:
            pass
    return result


@router.put("/settings/alert-thresholds")
def update_alert_thresholds(
    body: AlertThresholds,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_superuser),
):
    """Update alert thresholds (superuser only). Values are percentages 1-100."""
    for name, v in (("cpu", body.cpu), ("memory", body.memory), ("disk", body.disk)):
        if not (1 <= v <= 100):
            raise HTTPException(status_code=400, detail=f"{name} must be between 1 and 100")

    value = json.dumps({"cpu": body.cpu, "memory": body.memory, "disk": body.disk})
    row = db.query(models.AppSetting).filter(models.AppSetting.key == "alert_thresholds").first()
    if row:
        row.value = value
    else:
        db.add(models.AppSetting(
            key="alert_thresholds",
            value=value,
            description="Mobile alert thresholds (CPU/RAM/disk %)",
        ))
    db.commit()
    return {"cpu": body.cpu, "memory": body.memory, "disk": body.disk}
