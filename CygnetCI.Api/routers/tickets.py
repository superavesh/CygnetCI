"""Ticketing endpoints: tickets, comments, attachments, approvals, and AI assist."""
import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models

router = APIRouter()

class TicketCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    type: str = "task"
    assigned_to: Optional[int] = None
    created_by: Optional[int] = None
    customer_id: Optional[int] = None
    pipeline_id: Optional[int] = None
    release_id: Optional[int] = None
    agent_id: Optional[int] = None

class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    type: Optional[str] = None
    assigned_to: Optional[int] = None
    customer_id: Optional[int] = None
    pipeline_id: Optional[int] = None
    release_id: Optional[int] = None
    agent_id: Optional[int] = None
    root_cause: Optional[str] = None
    resolution_steps: Optional[list] = None
    resolution_commands: Optional[str] = None
    resolved_by: Optional[int] = None

def _get_user_name(db, user_id):
    if not user_id:
        return None
    u = db.query(models.User).filter(models.User.id == user_id).first()
    return (u.full_name or u.username) if u else None

def format_ticket(ticket, db):
    return {
        "id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "type": ticket.type,
        "created_by_id": ticket.created_by,
        "created_by_name": _get_user_name(db, ticket.created_by),
        "assigned_to_id": ticket.assigned_to,
        "assigned_to_name": _get_user_name(db, ticket.assigned_to),
        "customer_id": ticket.customer_id,
        "customer_name": (db.query(models.Customer).filter(models.Customer.id == ticket.customer_id).first().display_name
                          if ticket.customer_id else None),
        "pipeline_id": ticket.pipeline_id,
        "pipeline_name": (db.query(models.Pipeline).filter(models.Pipeline.id == ticket.pipeline_id).first().name
                          if ticket.pipeline_id else None),
        "release_id": ticket.release_id,
        "release_name": (db.query(models.Release).filter(models.Release.id == ticket.release_id).first().name
                         if ticket.release_id else None),
        "agent_id": ticket.agent_id,
        "agent_name": (db.query(models.Agent).filter(models.Agent.id == ticket.agent_id).first().name
                       if ticket.agent_id else None),
        "root_cause": ticket.root_cause,
        "resolution_steps": ticket.resolution_steps or [],
        "resolution_commands": ticket.resolution_commands,
        "resolved_by_id": ticket.resolved_by,
        "resolved_by_name": _get_user_name(db, ticket.resolved_by),
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
    }

@router.get("/tickets", tags=["🎫 Ticketing"])
def list_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    type: Optional[str] = None,
    assigned_to: Optional[int] = None,
    customer_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all tickets with optional filters"""
    q = db.query(models.Ticket)
    if status:
        q = q.filter(models.Ticket.status == status)
    if priority:
        q = q.filter(models.Ticket.priority == priority)
    if type:
        q = q.filter(models.Ticket.type == type)
    if assigned_to:
        q = q.filter(models.Ticket.assigned_to == assigned_to)
    if customer_id:
        q = q.filter(models.Ticket.customer_id == customer_id)
    if search:
        q = q.filter(
            models.Ticket.title.ilike(f"%{search}%") |
            models.Ticket.description.ilike(f"%{search}%") |
            models.Ticket.ticket_number.ilike(f"%{search}%")
        )
    tickets = q.order_by(models.Ticket.created_at.desc()).all()
    return [format_ticket(t, db) for t in tickets]

@router.post("/tickets", tags=["🎫 Ticketing"], status_code=201)
def create_ticket(ticket: TicketCreate, db: Session = Depends(get_db)):
    """Create a new ticket"""
    last = db.query(models.Ticket).order_by(models.Ticket.id.desc()).first()
    if last and last.ticket_number:
        try:
            next_num = int(last.ticket_number.split("-")[1]) + 1
        except (IndexError, ValueError):
            next_num = 1
    else:
        next_num = 1
    ticket_number = f"TKT-{next_num:04d}"

    db_ticket = models.Ticket(
        ticket_number=ticket_number,
        title=ticket.title,
        description=ticket.description,
        priority=ticket.priority,
        type=ticket.type,
        status="open",
        created_by=ticket.created_by,
        assigned_to=ticket.assigned_to,
        customer_id=ticket.customer_id,
        pipeline_id=ticket.pipeline_id,
        release_id=ticket.release_id,
        agent_id=ticket.agent_id,
    )
    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    return format_ticket(db_ticket, db)

@router.get("/tickets/{ticket_id}", tags=["🎫 Ticketing"])
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    """Get a single ticket by ID"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return format_ticket(ticket, db)

@router.put("/tickets/{ticket_id}", tags=["🎫 Ticketing"])
def update_ticket(ticket_id: int, data: TicketUpdate, db: Session = Depends(get_db)):
    """Update a ticket — any field including resolution details"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    for field in ["title", "description", "status", "priority", "type",
                  "assigned_to", "customer_id", "pipeline_id", "release_id", "agent_id",
                  "root_cause", "resolution_steps", "resolution_commands"]:
        val = getattr(data, field)
        if val is not None:
            setattr(ticket, field, val)

    if data.resolved_by is not None:
        ticket.resolved_by = data.resolved_by

    # Auto-set resolved_at when status moves to resolved/closed
    if data.status in ("resolved", "closed") and not ticket.resolved_at:
        ticket.resolved_at = datetime.now()

    # Clear resolved_at if status is moved back to open/in_progress
    if data.status in ("open", "in_progress"):
        ticket.resolved_at = None

    db.commit()
    db.refresh(ticket)
    return format_ticket(ticket, db)

@router.delete("/tickets/{ticket_id}", tags=["🎫 Ticketing"], status_code=204)
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    """Delete a ticket"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.delete(ticket)
    db.commit()
    return Response(status_code=204)

# ── Ticket Attachments ────────────────────────────────────────────────────────

TICKET_ATTACHMENTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "ticket_attachments")
os.makedirs(TICKET_ATTACHMENTS_DIR, exist_ok=True)

def format_attachment(a, db):
    uploader = db.query(models.User).filter(models.User.id == a.uploaded_by).first() if a.uploaded_by else None
    return {
        "id": a.id,
        "ticket_id": a.ticket_id,
        "original_filename": a.original_filename,
        "file_size": a.file_size,
        "mime_type": a.mime_type,
        "uploaded_by_id": a.uploaded_by,
        "uploaded_by_name": (uploader.full_name or uploader.username) if uploader else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }

@router.get("/tickets/{ticket_id}/attachments", tags=["🎫 Ticketing"])
def list_ticket_attachments(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    rows = db.query(models.TicketAttachment).filter(
        models.TicketAttachment.ticket_id == ticket_id
    ).order_by(models.TicketAttachment.created_at.asc()).all()
    return [format_attachment(r, db) for r in rows]

@router.post("/tickets/{ticket_id}/attachments", tags=["🎫 Ticketing"], status_code=201)
async def upload_ticket_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    uploaded_by: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ext = os.path.splitext(file.filename or "")[1].lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(TICKET_ATTACHMENTS_DIR, stored_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    attachment = models.TicketAttachment(
        ticket_id=ticket_id,
        original_filename=file.filename or stored_name,
        stored_filename=stored_name,
        file_size=len(content),
        mime_type=file.content_type,
        uploaded_by=uploaded_by,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return format_attachment(attachment, db)

@router.get("/ticket-attachments/{attachment_id}/download", tags=["🎫 Ticketing"])
def download_ticket_attachment(attachment_id: int, db: Session = Depends(get_db)):
    attachment = db.query(models.TicketAttachment).filter(
        models.TicketAttachment.id == attachment_id
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path = os.path.join(TICKET_ATTACHMENTS_DIR, attachment.stored_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=file_path,
        filename=attachment.original_filename,
        media_type=attachment.mime_type or "application/octet-stream"
    )

@router.delete("/ticket-attachments/{attachment_id}", tags=["🎫 Ticketing"], status_code=204)
def delete_ticket_attachment(attachment_id: int, db: Session = Depends(get_db)):
    attachment = db.query(models.TicketAttachment).filter(
        models.TicketAttachment.id == attachment_id
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path = os.path.join(TICKET_ATTACHMENTS_DIR, attachment.stored_filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    db.delete(attachment)
    db.commit()
    return Response(status_code=204)

@router.get("/tickets-stats", tags=["🎫 Ticketing"])
def get_ticket_stats(db: Session = Depends(get_db)):
    """Counts per status and priority for dashboard widgets"""
    from sqlalchemy import func as sqlfunc
    status_rows = db.query(models.Ticket.status, sqlfunc.count(models.Ticket.id)).group_by(models.Ticket.status).all()
    priority_rows = db.query(models.Ticket.priority, sqlfunc.count(models.Ticket.id)).group_by(models.Ticket.priority).all()
    return {
        "by_status": {s: c for s, c in status_rows},
        "by_priority": {p: c for p, c in priority_rows},
        "total": sum(c for _, c in status_rows),
    }


# ── Ticket Comments ───────────────────────────────────────────────────────────

def format_comment(c, db):
    user = db.query(models.User).filter(models.User.id == c.created_by).first() if c.created_by else None
    return {
        "id": c.id,
        "ticket_id": c.ticket_id,
        "body": c.body,
        "created_by_id": c.created_by,
        "created_by_name": (user.full_name or user.username) if user else None,
        "edited_at": c.edited_at.isoformat() if c.edited_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }

@router.get("/tickets/{ticket_id}/comments", tags=["🎫 Ticketing"])
def list_comments(ticket_id: int, db: Session = Depends(get_db)):
    rows = db.query(models.TicketComment).filter(
        models.TicketComment.ticket_id == ticket_id
    ).order_by(models.TicketComment.created_at.asc()).all()
    return [format_comment(r, db) for r in rows]

class CommentCreate(BaseModel):
    body: str
    created_by: Optional[int] = None

@router.post("/tickets/{ticket_id}/comments", tags=["🎫 Ticketing"], status_code=201)
def create_comment(ticket_id: int, data: CommentCreate, db: Session = Depends(get_db)):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    c = models.TicketComment(ticket_id=ticket_id, body=data.body, created_by=data.created_by)
    db.add(c)
    # history
    db.add(models.TicketHistory(
        ticket_id=ticket_id, changed_by=data.created_by,
        field_name="comment", old_value=None, new_value="added comment"
    ))
    db.commit()
    db.refresh(c)
    return format_comment(c, db)

class CommentUpdate(BaseModel):
    body: str
    updated_by: Optional[int] = None

@router.put("/ticket-comments/{comment_id}", tags=["🎫 Ticketing"])
def update_comment(comment_id: int, data: CommentUpdate, db: Session = Depends(get_db)):
    c = db.query(models.TicketComment).filter(models.TicketComment.id == comment_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    c.body = data.body
    c.edited_at = datetime.now()
    db.commit()
    db.refresh(c)
    return format_comment(c, db)

@router.delete("/ticket-comments/{comment_id}", tags=["🎫 Ticketing"], status_code=204)
def delete_comment(comment_id: int, db: Session = Depends(get_db)):
    c = db.query(models.TicketComment).filter(models.TicketComment.id == comment_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(c)
    db.commit()
    return Response(status_code=204)


# ── Ticket History ────────────────────────────────────────────────────────────

def format_history(h, db):
    user = db.query(models.User).filter(models.User.id == h.changed_by).first() if h.changed_by else None
    return {
        "id": h.id,
        "ticket_id": h.ticket_id,
        "changed_by_id": h.changed_by,
        "changed_by_name": (user.full_name or user.username) if user else None,
        "field_name": h.field_name,
        "old_value": h.old_value,
        "new_value": h.new_value,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    }

@router.get("/tickets/{ticket_id}/history", tags=["🎫 Ticketing"])
def get_ticket_history(ticket_id: int, db: Session = Depends(get_db)):
    rows = db.query(models.TicketHistory).filter(
        models.TicketHistory.ticket_id == ticket_id
    ).order_by(models.TicketHistory.created_at.asc()).all()
    return [format_history(r, db) for r in rows]


# ── Ticket Update with History Tracking ──────────────────────────────────────

class TicketUpdateWithHistory(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    type: Optional[str] = None
    assigned_to: Optional[int] = None
    customer_id: Optional[int] = None
    pipeline_id: Optional[int] = None
    release_id: Optional[int] = None
    agent_id: Optional[int] = None
    root_cause: Optional[str] = None
    resolution_steps: Optional[list] = None
    resolution_commands: Optional[str] = None
    resolved_by: Optional[int] = None
    changed_by: Optional[int] = None

@router.patch("/tickets/{ticket_id}/update", tags=["🎫 Ticketing"])
def patch_ticket_with_history(ticket_id: int, data: TicketUpdateWithHistory, db: Session = Depends(get_db)):
    """Update ticket fields and record history for each changed field"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    tracked = ["title", "description", "status", "priority", "type",
               "assigned_to", "customer_id", "pipeline_id", "release_id",
               "agent_id", "root_cause", "resolution_commands"]

    for field in tracked:
        new_val = getattr(data, field)
        if new_val is not None:
            old_val = getattr(ticket, field)
            if str(old_val or "") != str(new_val or ""):
                db.add(models.TicketHistory(
                    ticket_id=ticket_id,
                    changed_by=data.changed_by,
                    field_name=field,
                    old_value=str(old_val) if old_val is not None else None,
                    new_value=str(new_val),
                ))
            setattr(ticket, field, new_val)

    if data.resolution_steps is not None:
        old = str(ticket.resolution_steps or [])
        new = str(data.resolution_steps)
        if old != new:
            db.add(models.TicketHistory(
                ticket_id=ticket_id, changed_by=data.changed_by,
                field_name="resolution_steps", old_value=old, new_value=new,
            ))
        ticket.resolution_steps = data.resolution_steps

    if data.resolved_by is not None:
        ticket.resolved_by = data.resolved_by

    if data.status in ("resolved", "closed") and not ticket.resolved_at:
        ticket.resolved_at = datetime.now()
    if data.status in ("open", "in_progress"):
        ticket.resolved_at = None

    db.commit()
    db.refresh(ticket)
    return format_ticket(ticket, db)


# ── Ticket Approvals ──────────────────────────────────────────────────────────

def format_approval(a, db):
    req = db.query(models.User).filter(models.User.id == a.requested_by).first() if a.requested_by else None
    rev = db.query(models.User).filter(models.User.id == a.reviewed_by).first() if a.reviewed_by else None
    return {
        "id": a.id,
        "ticket_id": a.ticket_id,
        "requested_by_id": a.requested_by,
        "requested_by_name": (req.full_name or req.username) if req else None,
        "reviewed_by_id": a.reviewed_by,
        "reviewed_by_name": (rev.full_name or rev.username) if rev else None,
        "status": a.status,
        "note": a.note,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
    }

@router.get("/tickets/{ticket_id}/approvals", tags=["🎫 Ticketing"])
def list_approvals(ticket_id: int, db: Session = Depends(get_db)):
    rows = db.query(models.TicketApproval).filter(
        models.TicketApproval.ticket_id == ticket_id
    ).order_by(models.TicketApproval.created_at.desc()).all()
    return [format_approval(r, db) for r in rows]

class ApprovalRequest(BaseModel):
    requested_by: Optional[int] = None

@router.post("/tickets/{ticket_id}/approvals", tags=["🎫 Ticketing"], status_code=201)
def request_approval(ticket_id: int, data: ApprovalRequest, db: Session = Depends(get_db)):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    a = models.TicketApproval(ticket_id=ticket_id, requested_by=data.requested_by, status="pending")
    db.add(a)
    db.add(models.TicketHistory(
        ticket_id=ticket_id, changed_by=data.requested_by,
        field_name="approval", old_value=None, new_value="requested"
    ))
    db.commit()
    db.refresh(a)
    return format_approval(a, db)

class ApprovalReview(BaseModel):
    status: str  # approved | rejected
    note: Optional[str] = None
    reviewed_by: Optional[int] = None

@router.put("/ticket-approvals/{approval_id}", tags=["🎫 Ticketing"])
def review_approval(approval_id: int, data: ApprovalReview, db: Session = Depends(get_db)):
    a = db.query(models.TicketApproval).filter(models.TicketApproval.id == approval_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Approval not found")
    if data.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be approved or rejected")
    a.status = data.status
    a.note = data.note
    a.reviewed_by = data.reviewed_by
    a.reviewed_at = datetime.now()
    db.add(models.TicketHistory(
        ticket_id=a.ticket_id, changed_by=data.reviewed_by,
        field_name="approval", old_value="pending", new_value=data.status
    ))
    db.commit()
    db.refresh(a)
    return format_approval(a, db)


# ── AI Settings ───────────────────────────────────────────────────────────────

from cryptography.fernet import Fernet, InvalidToken
import base64

# SECURITY: the encryption key is read from the AI_SETTINGS_KEY environment variable.
# It must be a 32-byte value. The previous build used a hardcoded key; that key is kept
# ONLY as a decryption fallback so existing rows stay readable after you set a real key.
# Set AI_SETTINGS_KEY in the environment to a strong secret and re-save the AI API key to
# migrate it; once migrated you can remove the legacy fallback.
def _fernet_from_seed(seed: bytes) -> Fernet:
    seed = seed[:32].ljust(32, b"0")  # normalize to exactly 32 bytes
    return Fernet(base64.urlsafe_b64encode(seed))

_LEGACY_FERNET = _fernet_from_seed(b"CygnetCI-AI-Settings-Secret-Key!")
_env_key = os.environ.get("AI_SETTINGS_KEY")
_fernet = _fernet_from_seed(_env_key.encode()) if _env_key else _LEGACY_FERNET

def _encrypt(plain: str) -> str:
    return _fernet.encrypt(plain.encode()).decode()

def _decrypt(token: str) -> str:
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        # Fall back to the legacy key so data encrypted before AI_SETTINGS_KEY was set
        # still decrypts. (No-op if the env key is unset / already the legacy key.)
        return _LEGACY_FERNET.decrypt(token.encode()).decode()

class AISettingsBody(BaseModel):
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-6"
    api_key: Optional[str] = None
    customer_id: Optional[int] = None

@router.get("/ai-settings", tags=["🎫 Ticketing"])
def get_ai_settings(customer_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.AISettings)
    if customer_id:
        q = q.filter(models.AISettings.customer_id == customer_id)
    else:
        q = q.filter(models.AISettings.customer_id == None)
    s = q.first()
    if not s:
        return {"provider": "anthropic", "model": "claude-sonnet-4-6", "has_api_key": False, "customer_id": customer_id}
    return {
        "id": s.id,
        "provider": s.provider,
        "model": s.model,
        "has_api_key": bool(s.api_key_encrypted),
        "customer_id": s.customer_id,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }

@router.put("/ai-settings", tags=["🎫 Ticketing"])
def upsert_ai_settings(data: AISettingsBody, db: Session = Depends(get_db)):
    q = db.query(models.AISettings)
    if data.customer_id:
        q = q.filter(models.AISettings.customer_id == data.customer_id)
    else:
        q = q.filter(models.AISettings.customer_id == None)
    s = q.first()
    if not s:
        s = models.AISettings(customer_id=data.customer_id)
        db.add(s)
    s.provider = data.provider
    s.model = data.model
    if data.api_key:
        s.api_key_encrypted = _encrypt(data.api_key)
    db.commit()
    db.refresh(s)
    return {
        "id": s.id,
        "provider": s.provider,
        "model": s.model,
        "has_api_key": bool(s.api_key_encrypted),
        "customer_id": s.customer_id,
    }


# ── AI Chat ───────────────────────────────────────────────────────────────────

from fastapi.responses import StreamingResponse
import json as _json

class AIChatMessage(BaseModel):
    role: str
    content: str

class AIChatRequest(BaseModel):
    messages: List[AIChatMessage]
    ticket_id: Optional[int] = None
    customer_id: Optional[int] = None

@router.post("/tickets/ai-chat", tags=["🎫 Ticketing"])
async def ai_chat(request: AIChatRequest, db: Session = Depends(get_db)):
    """Stream AI responses for ticket assistant chat"""
    # Load settings
    q = db.query(models.AISettings)
    if request.customer_id:
        s = q.filter(models.AISettings.customer_id == request.customer_id).first()
    else:
        s = q.filter(models.AISettings.customer_id == None).first()

    if not s or not s.api_key_encrypted:
        raise HTTPException(status_code=400, detail="AI not configured. Please set API key in AI Settings.")

    api_key = _decrypt(s.api_key_encrypted)
    model = s.model or "claude-sonnet-4-6"

    # Build system prompt with ticket context
    system_parts = [
        "You are a helpful assistant for CygnetCI, a CI/CD platform. "
        "You help users understand tickets, resolve issues, and navigate the system. "
        "Be concise and practical."
    ]
    if request.ticket_id:
        ticket = db.query(models.Ticket).filter(models.Ticket.id == request.ticket_id).first()
        if ticket:
            system_parts.append(
                f"\nCurrent ticket context: [{ticket.ticket_number}] {ticket.title} "
                f"(status={ticket.status}, priority={ticket.priority}, type={ticket.type}). "
                f"Description: {(ticket.description or '')[:500]}"
            )

    system_prompt = " ".join(system_parts)

    async def stream_response():
        try:
            import httpx as _httpx
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            body = {
                "model": model,
                "max_tokens": 1024,
                "system": system_prompt,
                "stream": True,
                "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            }
            async with _httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST", "https://api.anthropic.com/v1/messages", headers=headers, json=body
                ) as resp:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                yield "data: [DONE]\n\n"
                                break
                            try:
                                event = _json.loads(data)
                                if event.get("type") == "content_block_delta":
                                    text = event.get("delta", {}).get("text", "")
                                    if text:
                                        yield f"data: {_json.dumps({'text': text})}\n\n"
                                elif event.get("type") == "message_stop":
                                    yield "data: [DONE]\n\n"
                                    break
                            except Exception:
                                pass
        except Exception as e:
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


# ── AI Assist (list page — full tool use) ─────────────────────────────────────

_TICKET_TOOLS = [
    {
        "name": "search_tickets",
        "description": "Search and list tickets. Returns up to 10 matching tickets.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status":   {"type": "string", "enum": ["open", "in_progress", "resolved", "closed"]},
                "priority": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                "type":     {"type": "string", "enum": ["bug", "task", "improvement", "question"]},
                "search":   {"type": "string", "description": "Text search across title, description, ticket number"},
                "customer_id": {"type": "integer"},
            },
        },
    },
    {
        "name": "get_ticket",
        "description": "Get full details of one ticket by its numeric ID or ticket number (e.g. TKT-0042).",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticket_id":     {"type": "integer"},
                "ticket_number": {"type": "string"},
            },
        },
    },
    {
        "name": "create_ticket",
        "description": "Create a new ticket. title is required; all other fields are optional.",
        "input_schema": {
            "type": "object",
            "required": ["title"],
            "properties": {
                "title":       {"type": "string"},
                "description": {"type": "string"},
                "priority":    {"type": "string", "enum": ["critical", "high", "medium", "low"], "default": "medium"},
                "type":        {"type": "string", "enum": ["bug", "task", "improvement", "question"], "default": "task"},
                "customer_id": {"type": "integer"},
                "assigned_to_id": {"type": "integer"},
                "pipeline_id": {"type": "integer"},
                "release_id":  {"type": "integer"},
            },
        },
    },
    {
        "name": "update_ticket",
        "description": "Update one or more fields on an existing ticket. ticket_id is required.",
        "input_schema": {
            "type": "object",
            "required": ["ticket_id"],
            "properties": {
                "ticket_id":   {"type": "integer"},
                "title":       {"type": "string"},
                "description": {"type": "string"},
                "status":      {"type": "string", "enum": ["open", "in_progress", "resolved", "closed"]},
                "priority":    {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                "type":        {"type": "string", "enum": ["bug", "task", "improvement", "question"]},
                "assigned_to_id": {"type": "integer"},
                "root_cause":  {"type": "string"},
                "resolution_commands": {"type": "string"},
            },
        },
    },
]

def _execute_ticket_tool(name: str, inp: dict, db: Session) -> str:
    try:
        if name == "search_tickets":
            q = db.query(models.Ticket)
            if s := inp.get("status"):   q = q.filter(models.Ticket.status == s)
            if p := inp.get("priority"): q = q.filter(models.Ticket.priority == p)
            if tp := inp.get("type"):    q = q.filter(models.Ticket.type == tp)
            if cid := inp.get("customer_id"): q = q.filter(models.Ticket.customer_id == cid)
            if srch := inp.get("search"):
                q = q.filter(
                    models.Ticket.title.ilike(f"%{srch}%") |
                    models.Ticket.description.ilike(f"%{srch}%") |
                    models.Ticket.ticket_number.ilike(f"%{srch}%")
                )
            rows = q.order_by(models.Ticket.created_at.desc()).limit(10).all()
            return _json.dumps({"tickets": [format_ticket(r, db) for r in rows], "count": len(rows)})

        if name == "get_ticket":
            if tid := inp.get("ticket_id"):
                t = db.query(models.Ticket).filter(models.Ticket.id == tid).first()
            elif tnum := inp.get("ticket_number"):
                t = db.query(models.Ticket).filter(models.Ticket.ticket_number == tnum).first()
            else:
                return _json.dumps({"error": "ticket_id or ticket_number required"})
            return _json.dumps(format_ticket(t, db)) if t else _json.dumps({"error": "not found"})

        if name == "create_ticket":
            last = db.query(models.Ticket).order_by(models.Ticket.id.desc()).first()
            try:
                next_num = int(last.ticket_number.split("-")[1]) + 1 if last and last.ticket_number else 1
            except Exception:
                next_num = 1
            t = models.Ticket(
                ticket_number=f"TKT-{next_num:04d}",
                title=inp["title"],
                description=inp.get("description"),
                priority=inp.get("priority", "medium"),
                type=inp.get("type", "task"),
                status="open",
                assigned_to=inp.get("assigned_to_id"),
                customer_id=inp.get("customer_id"),
                pipeline_id=inp.get("pipeline_id"),
                release_id=inp.get("release_id"),
            )
            db.add(t)
            db.commit()
            db.refresh(t)
            return _json.dumps({"created": True, "ticket": format_ticket(t, db)})

        if name == "update_ticket":
            t = db.query(models.Ticket).filter(models.Ticket.id == inp["ticket_id"]).first()
            if not t:
                return _json.dumps({"error": "ticket not found"})
            for fld in ["title", "description", "status", "priority", "type", "root_cause", "resolution_commands"]:
                if (v := inp.get(fld)) is not None:
                    setattr(t, fld, v)
            if "assigned_to_id" in inp:
                t.assigned_to = inp["assigned_to_id"]
            if inp.get("status") in ("resolved", "closed") and not t.resolved_at:
                t.resolved_at = datetime.now()
            if inp.get("status") in ("open", "in_progress"):
                t.resolved_at = None
            db.commit()
            db.refresh(t)
            return _json.dumps({"updated": True, "ticket": format_ticket(t, db)})

        return _json.dumps({"error": f"unknown tool: {name}"})
    except Exception as e:
        return _json.dumps({"error": str(e)})

@router.post("/tickets/ai-assist", tags=["🎫 Ticketing"])
async def ai_assist(request: AIChatRequest, db: Session = Depends(get_db)):
    """Agentic ticket assistant — searches, creates and updates tickets via tool use."""
    import httpx as _httpx

    q = db.query(models.AISettings)
    s = (q.filter(models.AISettings.customer_id == request.customer_id).first()
         if request.customer_id
         else q.filter(models.AISettings.customer_id == None).first())

    if not s or not s.api_key_encrypted:
        raise HTTPException(status_code=400, detail="AI not configured. Please add an API key in AI Settings.")

    api_key = _decrypt(s.api_key_encrypted)
    model = s.model or "claude-sonnet-4-6"

    system_prompt = (
        "You are an AI ticket assistant for CygnetCI, a CI/CD platform. "
        "You can search for existing tickets, create new tickets, and update tickets. "
        "Always confirm what you did. When the user asks to create a ticket, use the tool immediately "
        "with the info provided (title is the only required field). "
        "Types: bug, task, improvement, question. Priorities: critical, high, medium, low. "
        "Statuses: open, in_progress, resolved, closed. "
        "Be concise and action-oriented."
    )

    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    actions: list = []
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    async with _httpx.AsyncClient(timeout=60) as client:
        for _ in range(6):  # max 6 rounds (tool call → result → response)
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json={
                    "model": model,
                    "max_tokens": 1024,
                    "system": system_prompt,
                    "tools": _TICKET_TOOLS,
                    "messages": messages,
                },
            )
            if not resp.is_success:
                raise HTTPException(status_code=502, detail=f"AI API error: {resp.text[:300]}")

            data = resp.json()
            stop = data.get("stop_reason")

            if stop == "end_turn":
                reply = "".join(
                    blk.get("text", "") for blk in data.get("content", []) if blk.get("type") == "text"
                )
                return {"reply": reply, "actions": actions}

            if stop == "tool_use":
                messages.append({"role": "assistant", "content": data["content"]})
                tool_results = []
                for blk in data["content"]:
                    if blk.get("type") != "tool_use":
                        continue
                    result_str = _execute_ticket_tool(blk["name"], blk.get("input", {}), db)
                    result_data = _json.loads(result_str)

                    if blk["name"] == "create_ticket" and result_data.get("created"):
                        actions.append({"type": "created", "ticket": result_data["ticket"]})
                    elif blk["name"] == "update_ticket" and result_data.get("updated"):
                        actions.append({"type": "updated", "ticket": result_data["ticket"]})
                    elif blk["name"] == "search_tickets":
                        actions.append({"type": "found", "tickets": result_data.get("tickets", [])})
                    elif blk["name"] == "get_ticket" and result_data.get("id"):
                        actions.append({"type": "found", "tickets": [result_data]})

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": blk["id"],
                        "content": result_str,
                    })
                messages.append({"role": "user", "content": tool_results})
                continue

            # Unexpected stop reason — return whatever text we have
            reply = "".join(
                blk.get("text", "") for blk in data.get("content", []) if blk.get("type") == "text"
            )
            return {"reply": reply or "Done.", "actions": actions}

    return {"reply": "Completed.", "actions": actions}
