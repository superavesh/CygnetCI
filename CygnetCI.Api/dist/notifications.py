"""Settings lookup + alert-email helpers (moved out of main.py)."""
from datetime import datetime
from sqlalchemy.orm import Session

import models
import email_publisher


def _get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.query(models.AppSetting).filter(models.AppSetting.key == key).first()
    return row.value if row and row.value is not None else default


def _publish_alert(db: Session, alert_subject: str, message: str, event: str, resource: str = ""):
    """Send a system alert email to the configured recipient list (best-effort)."""
    recipients_raw = _get_setting(db, "alert_recipients", "")
    recipients = [r.strip() for r in recipients_raw.replace(";", ",").split(",") if r.strip()]
    if not recipients:
        return
    try:
        email_publisher.publish_email(
            email_type="agent_alert",
            to=recipients,
            template="agent_alert",
            data={
                "alert_subject": alert_subject,
                "message": message,
                "event": event,
                "resource": resource,
                "occurred_at": datetime.now().isoformat(timespec="seconds"),
            },
        )
    except Exception as e:  # noqa: BLE001
        print(f"[alert] failed to queue alert '{alert_subject}': {e}")
