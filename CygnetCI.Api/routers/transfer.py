"""File transfer endpoints (UI file management + agent file transfer)."""
import hashlib
import os
import shutil
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from config import app_config
from deps import get_agent_uuid

router = APIRouter()

# ==============================================
# FILE TRANSFER ENDPOINTS
# ==============================================

class FilePushRequest(BaseModel):
    transfer_file_id: int
    agent_uuid: str
    agent_name: Optional[str] = None
    requested_by: Optional[str] = None

class FileAcknowledgeRequest(BaseModel):
    success: bool
    error_message: Optional[str] = None

def calculate_checksum(file_path: str) -> str:
    """Calculate MD5 checksum of a file"""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

@router.post("/transfer/upload", tags=["🌐 UI - File Management"])
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    version: str = Form(...),
    uploaded_by: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload a file (script or artifact) to NFSShared folder"""

    # Validate file_type
    if file_type not in ['script', 'artifact']:
        raise HTTPException(status_code=400, detail="file_type must be 'script' or 'artifact'")

    # SECURITY: sanitize version and filename to prevent path traversal.
    # `version` becomes a directory name and `file.filename` a leaf file name; neither may
    # contain path separators, parent-directory references, or be absolute.
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    safe_filename = os.path.basename(file.filename.replace("\\", "/"))
    if not safe_filename or safe_filename in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    safe_version = (version or "").strip()
    if (not safe_version or ".." in safe_version
            or "/" in safe_version or "\\" in safe_version
            or os.path.isabs(safe_version)):
        raise HTTPException(status_code=400, detail="Invalid version")

    try:
        # Create folder structure using config helper
        folder_path = app_config.get_file_path(file_type, safe_version)
        os.makedirs(folder_path, exist_ok=True)

        # Save file (use sanitized leaf name)
        file_path = os.path.join(folder_path, safe_filename)

        # Defense in depth: ensure the resolved path stays inside the intended folder
        if os.path.commonpath([os.path.abspath(folder_path),
                                os.path.abspath(file_path)]) != os.path.abspath(folder_path):
            raise HTTPException(status_code=400, detail="Invalid file path")

        # Write file in chunks to handle large files efficiently.
        # SECURITY: enforce the size limit DURING the stream so an oversized upload is
        # aborted early instead of being written to disk in full first.
        max_size = app_config.get_max_file_size_bytes()
        file_size = 0
        chunk_size = 1024 * 1024  # 1 MB chunks
        too_large = False
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                file_size += len(chunk)
                if file_size > max_size:
                    too_large = True
                    break
                buffer.write(chunk)

        if too_large:
            if os.path.exists(file_path):
                os.remove(file_path)  # Clean up the partial file
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {app_config.get_max_file_size_mb()} MB"
            )

        # Calculate checksum if enabled in config
        checksum = None
        if app_config.should_calculate_checksum():
            checksum = calculate_checksum(file_path)

        # Check if file already exists in database
        existing_file = db.query(models.TransferFile)\
            .filter(
                models.TransferFile.file_type == file_type,
                models.TransferFile.file_name == safe_filename,
                models.TransferFile.version == safe_version
            ).first()

        if existing_file:
            # Update existing record
            existing_file.file_path = file_path
            existing_file.file_size_bytes = file_size
            existing_file.checksum = checksum
            existing_file.uploaded_by = uploaded_by
            existing_file.description = description
            existing_file.updated_at = datetime.now()
            db.commit()
            db.refresh(existing_file)

            return {
                "success": True,
                "message": "File updated successfully",
                "file": {
                    "id": existing_file.id,
                    "file_type": existing_file.file_type,
                    "file_name": existing_file.file_name,
                    "version": existing_file.version,
                    "file_path": existing_file.file_path,
                    "file_size_bytes": existing_file.file_size_bytes,
                    "checksum": existing_file.checksum
                }
            }

        # Create new database record
        transfer_file = models.TransferFile(
            file_type=file_type,
            file_name=safe_filename,
            version=safe_version,
            file_path=file_path,
            file_size_bytes=file_size,
            checksum=checksum,
            uploaded_by=uploaded_by,
            description=description
        )

        db.add(transfer_file)
        db.commit()
        db.refresh(transfer_file)

        return {
            "success": True,
            "message": "File uploaded successfully",
            "file": {
                "id": transfer_file.id,
                "file_type": transfer_file.file_type,
                "file_name": transfer_file.file_name,
                "version": transfer_file.version,
                "file_path": transfer_file.file_path,
                "file_size_bytes": transfer_file.file_size_bytes,
                "checksum": transfer_file.checksum
            }
        }

    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is (e.g. file too large)
    except Exception as e:
        import traceback
        print(f"Upload failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {type(e).__name__}: {str(e)}")

@router.get("/transfer/files", tags=["🌐 UI - File Management"])
def get_transfer_files(
    file_type: Optional[str] = None,
    version: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all uploaded files, optionally filtered by type and version"""
    query = db.query(models.TransferFile)

    if file_type:
        query = query.filter(models.TransferFile.file_type == file_type)
    if version:
        query = query.filter(models.TransferFile.version == version)

    files = query.order_by(models.TransferFile.created_at.desc()).all()

    return [
        {
            "id": f.id,
            "file_type": f.file_type,
            "file_name": f.file_name,
            "version": f.version,
            "file_path": f.file_path,
            "file_size_bytes": f.file_size_bytes,
            "checksum": f.checksum,
            "uploaded_by": f.uploaded_by,
            "description": f.description,
            "created_at": f.created_at.isoformat(),
            "updated_at": f.updated_at.isoformat()
        }
        for f in files
    ]

@router.get("/transfer/versions", tags=["🌐 UI - File Management"])
def get_versions(file_type: Optional[str] = None, db: Session = Depends(get_db)):
    """Get all unique versions, optionally filtered by file type"""
    query = db.query(models.TransferFile.version).distinct()

    if file_type:
        query = query.filter(models.TransferFile.file_type == file_type)

    versions = query.order_by(models.TransferFile.version.desc()).all()
    return [v[0] for v in versions]

@router.post("/transfer/push", tags=["🌐 UI - File Management"])
def push_file_to_agent(request: FilePushRequest, db: Session = Depends(get_db)):
    """Create a pickup entry for an agent to download a file"""

    # Verify transfer file exists
    transfer_file = db.query(models.TransferFile)\
        .filter(models.TransferFile.id == request.transfer_file_id)\
        .first()

    if not transfer_file:
        raise HTTPException(status_code=404, detail="Transfer file not found")

    # Check if pickup already exists for this agent and file
    existing_pickup = db.query(models.TransferFilePickup)\
        .filter(
            models.TransferFilePickup.transfer_file_id == request.transfer_file_id,
            models.TransferFilePickup.agent_uuid == request.agent_uuid,
            models.TransferFilePickup.status == "pending"
        ).first()

    if existing_pickup:
        return {
            "success": True,
            "message": "Pickup already exists for this agent",
            "pickup_id": existing_pickup.id
        }

    # Create pickup entry
    pickup = models.TransferFilePickup(
        transfer_file_id=request.transfer_file_id,
        agent_uuid=request.agent_uuid,
        agent_name=request.agent_name,
        file_type=transfer_file.file_type,
        version=transfer_file.version,
        status="pending",
        requested_by=request.requested_by
    )

    db.add(pickup)
    db.commit()
    db.refresh(pickup)

    return {
        "success": True,
        "message": "File pushed to agent successfully",
        "pickup_id": pickup.id,
        "agent_uuid": pickup.agent_uuid,
        "file_name": transfer_file.file_name,
        "version": transfer_file.version
    }

@router.get("/transfer/agent/downloads", tags=["🤖 Agent - File Transfer"])
def get_agent_downloads(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """Get all pending downloads for an agent"""
    pickups = db.query(models.TransferFilePickup)\
        .filter(
            models.TransferFilePickup.agent_uuid == agent_uuid,
            models.TransferFilePickup.status == "pending"
        )\
        .all()

    result = []
    for pickup in pickups:
        transfer_file = db.query(models.TransferFile)\
            .filter(models.TransferFile.id == pickup.transfer_file_id)\
            .first()

        if transfer_file:
            result.append({
                "pickup_id": pickup.id,
                "transfer_file_id": transfer_file.id,
                "file_type": transfer_file.file_type,
                "file_name": transfer_file.file_name,
                "version": transfer_file.version,
                "file_path": transfer_file.file_path,
                "file_size_bytes": transfer_file.file_size_bytes,
                "checksum": transfer_file.checksum,
                "requested_at": pickup.requested_at.isoformat()
            })

    return result

@router.get("/transfer/download/{pickup_id}", tags=["🤖 Agent - File Transfer"])
def download_file(pickup_id: int, db: Session = Depends(get_db)):
    """Download a file for an agent (used by agents)"""

    pickup = db.query(models.TransferFilePickup)\
        .filter(models.TransferFilePickup.id == pickup_id)\
        .first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    if pickup.status != "pending":
        raise HTTPException(status_code=400, detail="Pickup already processed")

    transfer_file = db.query(models.TransferFile)\
        .filter(models.TransferFile.id == pickup.transfer_file_id)\
        .first()

    if not transfer_file:
        raise HTTPException(status_code=404, detail="Transfer file not found")

    if not os.path.exists(transfer_file.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Mark as downloading — acknowledge endpoint will set final status
    pickup.status = "downloading"
    db.commit()

    return FileResponse(
        path=transfer_file.file_path,
        filename=transfer_file.file_name,
        media_type='application/octet-stream'
    )

@router.post("/transfer/acknowledge/{pickup_id}", tags=["🤖 Agent - File Transfer"])
def acknowledge_download(pickup_id: int, request: FileAcknowledgeRequest, db: Session = Depends(get_db)):
    """Agent acknowledges successful file download"""

    pickup = db.query(models.TransferFilePickup)\
        .filter(models.TransferFilePickup.id == pickup_id)\
        .first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    if request.success:
        # Keep the pickup entry for history but mark as acknowledged
        pickup.acknowledged_at = datetime.now()
        pickup.status = "downloaded"  # Ensure status is set to downloaded
        db.commit()

        return {
            "success": True,
            "message": "Download acknowledged successfully"
        }
    else:
        # Mark as failed
        pickup.status = "failed"
        pickup.error_message = request.error_message
        pickup.acknowledged_at = datetime.now()
        db.commit()

        return {
            "success": True,
            "message": "Download marked as failed"
        }

@router.get("/transfer/pickups", tags=["🌐 UI - File Management"])
def get_all_pickups(
    status: Optional[str] = None,
    agent_uuid: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all file pickup entries (for admin/monitoring)"""
    query = db.query(models.TransferFilePickup)

    if status:
        query = query.filter(models.TransferFilePickup.status == status)
    if agent_uuid:
        query = query.filter(models.TransferFilePickup.agent_uuid == agent_uuid)

    pickups = query.order_by(models.TransferFilePickup.requested_at.desc()).all()

    result = []
    for pickup in pickups:
        transfer_file = db.query(models.TransferFile)\
            .filter(models.TransferFile.id == pickup.transfer_file_id)\
            .first()

        result.append({
            "id": pickup.id,
            "transfer_file_id": pickup.transfer_file_id,
            "file_name": transfer_file.file_name if transfer_file else "Unknown",
            "file_type": pickup.file_type,
            "version": pickup.version,
            "file_size_bytes": transfer_file.file_size_bytes if transfer_file else None,
            "agent_uuid": pickup.agent_uuid,
            "agent_name": pickup.agent_name,
            "status": pickup.status,
            "requested_by": pickup.requested_by,
            "requested_at": pickup.requested_at.isoformat(),
            "downloaded_at": pickup.downloaded_at.isoformat() if pickup.downloaded_at else None,
            "acknowledged_at": pickup.acknowledged_at.isoformat() if pickup.acknowledged_at else None,
            "error_message": pickup.error_message
        })

    return result

@router.get("/transfer/files/{file_id}/history", tags=["🌐 UI - File Management"])
def get_file_transfer_history(file_id: int, limit: int = 50, db: Session = Depends(get_db)):
    """Get transfer history for a specific file"""

    # Verify file exists
    transfer_file = db.query(models.TransferFile)\
        .filter(models.TransferFile.id == file_id)\
        .first()

    if not transfer_file:
        raise HTTPException(status_code=404, detail="Transfer file not found")

    # Get all pickups for this file
    pickups = db.query(models.TransferFilePickup)\
        .filter(models.TransferFilePickup.transfer_file_id == file_id)\
        .order_by(models.TransferFilePickup.requested_at.desc())\
        .limit(limit)\
        .all()

    # Calculate statistics
    total_downloads = len(pickups)
    successful_downloads = sum(1 for p in pickups if p.status == 'downloaded')
    failed_downloads = sum(1 for p in pickups if p.status == 'failed')
    pending_downloads = sum(1 for p in pickups if p.status == 'pending')

    # Get unique agents that downloaded this file
    unique_agents = db.query(models.TransferFilePickup.agent_name)\
        .filter(
            models.TransferFilePickup.transfer_file_id == file_id,
            models.TransferFilePickup.agent_name.isnot(None)
        )\
        .distinct()\
        .all()

    result = []
    for pickup in pickups:
        # Calculate download duration if available
        duration = None
        if pickup.downloaded_at and pickup.requested_at:
            duration_seconds = int((pickup.downloaded_at - pickup.requested_at).total_seconds())
            duration = duration_seconds

        result.append({
            "id": pickup.id,
            "agent_uuid": pickup.agent_uuid,
            "agent_name": pickup.agent_name or "Unknown",
            "status": pickup.status,
            "requested_by": pickup.requested_by,
            "requested_at": pickup.requested_at.isoformat(),
            "downloaded_at": pickup.downloaded_at.isoformat() if pickup.downloaded_at else None,
            "acknowledged_at": pickup.acknowledged_at.isoformat() if pickup.acknowledged_at else None,
            "duration": duration,
            "error_message": pickup.error_message
        })

    return {
        "file_id": file_id,
        "file_name": transfer_file.file_name,
        "file_type": transfer_file.file_type,
        "version": transfer_file.version,
        "statistics": {
            "total_downloads": total_downloads,
            "successful": successful_downloads,
            "failed": failed_downloads,
            "pending": pending_downloads,
            "unique_agents": len(unique_agents)
        },
        "history": result
    }

@router.delete("/transfer/files/{file_id}", tags=["🌐 UI - File Management"])
def delete_transfer_file(file_id: int, db: Session = Depends(get_db)):
    """Delete a transfer file"""
    transfer_file = db.query(models.TransferFile)\
        .filter(models.TransferFile.id == file_id)\
        .first()

    if not transfer_file:
        raise HTTPException(status_code=404, detail="Transfer file not found")

    # Delete file from disk
    if os.path.exists(transfer_file.file_path):
        try:
            os.remove(transfer_file.file_path)
        except Exception as e:
            print(f"Warning: Could not delete file from disk: {e}")

    # Delete from database (pickups will cascade delete)
    db.delete(transfer_file)
    db.commit()

    return {"success": True, "message": "Transfer file deleted"}
