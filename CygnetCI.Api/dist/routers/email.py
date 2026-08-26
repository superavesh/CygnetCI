"""Email alerts + email configuration (IMAP/POP3 fetch) endpoints."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from email_service import (
    encrypt_password, decrypt_password, test_email_connection,
    fetch_emails_imap, fetch_emails_pop3,
)
from deps import require_permission, get_allowed_customer_ids, require_customer_access

router = APIRouter()

ALERTS = ["📧 Email Alerts"]
CONFIG = ["📧 Email Configuration"]


# ---------- models ----------
class EmailAlertCreate(BaseModel):
    subject: str
    sender: str
    sender_email: str
    preview: Optional[str] = None
    body: Optional[str] = None
    category: str = "inbox"
    priority: str = "medium"
    has_attachment: bool = False
    customer_id: Optional[int] = None


class EmailAlertUpdate(BaseModel):
    category: Optional[str] = None
    is_read: Optional[bool] = None
    is_starred: Optional[bool] = None
    priority: Optional[str] = None


class EmailConfigCreate(BaseModel):
    name: str
    email_address: str
    server_type: str = "imap"
    server_host: str
    server_port: int = 993
    username: str
    password: str
    use_ssl: bool = True
    folder: str = "INBOX"
    customer_id: Optional[int] = None


class EmailConfigUpdate(BaseModel):
    name: Optional[str] = None
    email_address: Optional[str] = None
    server_type: Optional[str] = None
    server_host: Optional[str] = None
    server_port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    use_ssl: Optional[bool] = None
    folder: Optional[str] = None
    is_active: Optional[bool] = None


def format_email_alert(email):
    return {
        "id": email.id,
        "subject": email.subject,
        "sender": email.sender,
        "senderEmail": email.sender_email,
        "preview": email.preview,
        "body": email.body,
        "receivedAt": email.received_at.isoformat() if email.received_at else None,
        "category": email.category,
        "isRead": email.is_read,
        "isStarred": email.is_starred,
        "hasAttachment": email.has_attachment,
        "priority": email.priority,
        "customerId": email.customer_id
    }


def format_email_config(config, include_password: bool = False):
    result = {
        "id": config.id,
        "name": config.name,
        "emailAddress": config.email_address,
        "serverType": config.server_type,
        "serverHost": config.server_host,
        "serverPort": config.server_port,
        "username": config.username,
        "useSsl": config.use_ssl,
        "folder": config.folder,
        "isActive": config.is_active,
        "lastSyncAt": config.last_sync_at.isoformat() if config.last_sync_at else None,
        "lastSyncStatus": config.last_sync_status,
        "lastSyncMessage": config.last_sync_message,
        "customerId": config.customer_id,
        "createdAt": config.created_at.isoformat() if config.created_at else None
    }
    if include_password:
        result["password"] = "********"
    return result


# ---------- email alerts ----------
@router.get("/email-alerts", tags=ALERTS)
def get_email_alerts(
    customer_id: Optional[int] = None,
    category: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_starred: Optional[bool] = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Get all email alerts with optional filters, scoped to the caller's assigned customers"""
    if customer_id is not None:
        require_customer_access(customer_id, allowed)

    query = db.query(models.EmailAlert)
    if customer_id is not None:
        query = query.filter(models.EmailAlert.customer_id == customer_id)
    elif allowed is not None:
        query = query.filter(models.EmailAlert.customer_id.in_(allowed))
    if category is not None:
        query = query.filter(models.EmailAlert.category == category)
    if is_read is not None:
        query = query.filter(models.EmailAlert.is_read == is_read)
    if is_starred is not None:
        query = query.filter(models.EmailAlert.is_starred == is_starred)

    emails = query.order_by(models.EmailAlert.received_at.desc()).all()
    return [format_email_alert(email) for email in emails]


@router.get("/email-alerts/{email_id}", tags=ALERTS)
def get_email_alert(
    email_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Get a specific email alert by ID"""
    email = db.query(models.EmailAlert).filter(models.EmailAlert.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email alert not found")
    require_customer_access(email.customer_id, allowed)
    return format_email_alert(email)


@router.post("/email-alerts", tags=ALERTS)
def create_email_alert(
    email_data: EmailAlertCreate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "create")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Create a new email alert"""
    require_customer_access(email_data.customer_id, allowed)
    email = models.EmailAlert(
        subject=email_data.subject,
        sender=email_data.sender,
        sender_email=email_data.sender_email,
        preview=email_data.preview,
        body=email_data.body,
        category=email_data.category,
        priority=email_data.priority,
        has_attachment=email_data.has_attachment,
        customer_id=email_data.customer_id
    )
    db.add(email)
    db.commit()
    db.refresh(email)
    return format_email_alert(email)


@router.patch("/email-alerts/{email_id}", tags=ALERTS)
def update_email_alert(
    email_id: int,
    email_data: EmailAlertUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "update")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Update an email alert (category, read status, starred status, priority)"""
    email = db.query(models.EmailAlert).filter(models.EmailAlert.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email alert not found")
    require_customer_access(email.customer_id, allowed)

    if email_data.category is not None:
        if email_data.category not in ['inbox', 'ignorable', 'moderate', 'critical', 'resolved']:
            raise HTTPException(status_code=400, detail="Invalid category")
        email.category = email_data.category
    if email_data.is_read is not None:
        email.is_read = email_data.is_read
    if email_data.is_starred is not None:
        email.is_starred = email_data.is_starred
    if email_data.priority is not None:
        if email_data.priority not in ['low', 'medium', 'high']:
            raise HTTPException(status_code=400, detail="Invalid priority")
        email.priority = email_data.priority

    db.commit()
    db.refresh(email)
    return format_email_alert(email)


@router.delete("/email-alerts/{email_id}", tags=ALERTS)
def delete_email_alert(
    email_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "delete")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Delete an email alert"""
    email = db.query(models.EmailAlert).filter(models.EmailAlert.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email alert not found")
    require_customer_access(email.customer_id, allowed)
    db.delete(email)
    db.commit()
    return {"success": True, "message": "Email alert deleted"}


@router.get("/email-alerts/stats/summary", tags=ALERTS)
def get_email_alerts_stats(
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Get email alerts statistics summary"""
    if customer_id is not None:
        require_customer_access(customer_id, allowed)

    query = db.query(models.EmailAlert)
    if customer_id is not None:
        query = query.filter(models.EmailAlert.customer_id == customer_id)
    elif allowed is not None:
        query = query.filter(models.EmailAlert.customer_id.in_(allowed))
    emails = query.all()
    return {
        "total": len(emails),
        "unread": sum(1 for e in emails if not e.is_read),
        "starred": sum(1 for e in emails if e.is_starred),
        "byCategory": {
            "inbox": sum(1 for e in emails if e.category == "inbox"),
            "ignorable": sum(1 for e in emails if e.category == "ignorable"),
            "moderate": sum(1 for e in emails if e.category == "moderate"),
            "critical": sum(1 for e in emails if e.category == "critical"),
            "resolved": sum(1 for e in emails if e.category == "resolved")
        },
        "byPriority": {
            "high": sum(1 for e in emails if e.priority == "high"),
            "medium": sum(1 for e in emails if e.priority == "medium"),
            "low": sum(1 for e in emails if e.priority == "low")
        }
    }


# ---------- email configuration ----------
@router.get("/email-configs", tags=CONFIG)
def get_email_configs(
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Get all email configurations"""
    if customer_id is not None:
        require_customer_access(customer_id, allowed)

    query = db.query(models.EmailConfig)
    if customer_id is not None:
        query = query.filter(models.EmailConfig.customer_id == customer_id)
    elif allowed is not None:
        query = query.filter(models.EmailConfig.customer_id.in_(allowed))
    configs = query.all()
    return [format_email_config(c) for c in configs]


@router.get("/email-configs/{config_id}", tags=CONFIG)
def get_email_config(
    config_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Get a specific email configuration"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")
    require_customer_access(config.customer_id, allowed)
    return format_email_config(config)


@router.post("/email-configs", tags=CONFIG)
def create_email_config(
    config_data: EmailConfigCreate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "create")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Create a new email configuration"""
    require_customer_access(config_data.customer_id, allowed)
    encrypted_password = encrypt_password(config_data.password)
    config = models.EmailConfig(
        name=config_data.name,
        email_address=config_data.email_address,
        server_type=config_data.server_type,
        server_host=config_data.server_host,
        server_port=config_data.server_port,
        username=config_data.username,
        password_encrypted=encrypted_password,
        use_ssl=config_data.use_ssl,
        folder=config_data.folder,
        customer_id=config_data.customer_id
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return format_email_config(config)


@router.put("/email-configs/{config_id}", tags=CONFIG)
def update_email_config(
    config_id: int,
    config_data: EmailConfigUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "update")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Update an email configuration"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")
    require_customer_access(config.customer_id, allowed)

    if config_data.name is not None:
        config.name = config_data.name
    if config_data.email_address is not None:
        config.email_address = config_data.email_address
    if config_data.server_type is not None:
        config.server_type = config_data.server_type
    if config_data.server_host is not None:
        config.server_host = config_data.server_host
    if config_data.server_port is not None:
        config.server_port = config_data.server_port
    if config_data.username is not None:
        config.username = config_data.username
    if config_data.password is not None:
        config.password_encrypted = encrypt_password(config_data.password)
    if config_data.use_ssl is not None:
        config.use_ssl = config_data.use_ssl
    if config_data.folder is not None:
        config.folder = config_data.folder
    if config_data.is_active is not None:
        config.is_active = config_data.is_active

    db.commit()
    db.refresh(config)
    return format_email_config(config)


@router.delete("/email-configs/{config_id}", tags=CONFIG)
def delete_email_config(
    config_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "delete")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Delete an email configuration"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")
    require_customer_access(config.customer_id, allowed)
    db.delete(config)
    db.commit()
    return {"success": True, "message": "Email configuration deleted"}


@router.post("/email-configs/test-connection", tags=CONFIG)
def test_email_config_connection(
    config_data: EmailConfigCreate,
    _perm: dict = Depends(require_permission("email", "read")),
):
    """Test email server connection without saving"""
    return test_email_connection(
        server_type=config_data.server_type,
        host=config_data.server_host,
        port=config_data.server_port,
        username=config_data.username,
        password=config_data.password,
        use_ssl=config_data.use_ssl
    )


@router.post("/email-configs/{config_id}/test", tags=CONFIG)
def test_saved_email_config(
    config_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Test a saved email configuration"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")
    require_customer_access(config.customer_id, allowed)
    password = decrypt_password(config.password_encrypted)
    return test_email_connection(
        server_type=config.server_type,
        host=config.server_host,
        port=config.server_port,
        username=config.username,
        password=password,
        use_ssl=config.use_ssl
    )


@router.post("/email-configs/{config_id}/sync", tags=CONFIG)
def sync_emails_from_config(
    config_id: int,
    limit: int = Query(50, description="Maximum number of emails to fetch"),
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("email", "update")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Fetch emails from configured email server and store them"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")
    require_customer_access(config.customer_id, allowed)
    if not config.is_active:
        raise HTTPException(status_code=400, detail="Email configuration is not active")

    try:
        password = decrypt_password(config.password_encrypted)

        if config.server_type == 'imap':
            emails = fetch_emails_imap(
                host=config.server_host, port=config.server_port,
                username=config.username, password=password,
                use_ssl=config.use_ssl, folder=config.folder, limit=limit
            )
        else:
            emails = fetch_emails_pop3(
                host=config.server_host, port=config.server_port,
                username=config.username, password=password,
                use_ssl=config.use_ssl, limit=limit
            )

        new_count = 0
        updated_count = 0
        for email_data in emails:
            existing = db.query(models.EmailAlert).filter(
                models.EmailAlert.subject == email_data['subject'],
                models.EmailAlert.sender_email == email_data['sender_email'],
                models.EmailAlert.customer_id == config.customer_id
            ).first()

            if existing:
                if not existing.body and email_data['body']:
                    existing.body = email_data['body']
                    updated_count += 1
            else:
                new_email = models.EmailAlert(
                    subject=email_data['subject'],
                    sender=email_data['sender'],
                    sender_email=email_data['sender_email'],
                    preview=email_data['preview'],
                    body=email_data['body'],
                    received_at=datetime.fromisoformat(email_data['received_at'].replace('Z', '+00:00')) if email_data['received_at'] else datetime.now(),
                    category='inbox',
                    is_read=email_data['is_read'],
                    is_starred=False,
                    has_attachment=email_data['has_attachment'],
                    priority=email_data['priority'],
                    customer_id=config.customer_id
                )
                db.add(new_email)
                new_count += 1

        config.last_sync_at = datetime.now()
        config.last_sync_status = 'success'
        config.last_sync_message = f'Fetched {len(emails)} emails. {new_count} new, {updated_count} updated.'
        db.commit()

        return {
            "success": True,
            "message": config.last_sync_message,
            "totalFetched": len(emails),
            "newEmails": new_count,
            "updatedEmails": updated_count
        }

    except Exception as e:
        config.last_sync_at = datetime.now()
        config.last_sync_status = 'failed'
        config.last_sync_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to sync emails: {str(e)}")


@router.get("/email-configs/presets/common", tags=CONFIG)
def get_common_email_presets(
    _perm: dict = Depends(require_permission("email", "read")),
):
    """Get common email server presets for easy configuration"""
    return [
        {"name": "Gmail", "serverType": "imap", "serverHost": "imap.gmail.com", "serverPort": 993, "useSsl": True, "note": "Enable 'Less secure app access' or use App Password"},
        {"name": "Outlook/Office 365", "serverType": "imap", "serverHost": "outlook.office365.com", "serverPort": 993, "useSsl": True, "note": "Use your Microsoft account credentials"},
        {"name": "Yahoo Mail", "serverType": "imap", "serverHost": "imap.mail.yahoo.com", "serverPort": 993, "useSsl": True, "note": "Generate an App Password in Yahoo settings"},
        {"name": "iCloud Mail", "serverType": "imap", "serverHost": "imap.mail.me.com", "serverPort": 993, "useSsl": True, "note": "Generate an App-Specific Password"},
        {"name": "Zoho Mail", "serverType": "imap", "serverHost": "imap.zoho.com", "serverPort": 993, "useSsl": True, "note": "Enable IMAP in Zoho settings"},
        {"name": "Custom IMAP", "serverType": "imap", "serverHost": "", "serverPort": 993, "useSsl": True, "note": "Enter your custom IMAP server details"},
        {"name": "Custom POP3", "serverType": "pop3", "serverHost": "", "serverPort": 995, "useSsl": True, "note": "Enter your custom POP3 server details"}
    ]
