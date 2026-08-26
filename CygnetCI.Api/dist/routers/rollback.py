"""Rollback script management endpoints."""
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
import models
from deps import require_permission

router = APIRouter(tags=["📜 Rollback Scripts"])


@router.post("/rollback/upload")
async def upload_rollback_script(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    uploaded_by: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("rollback", "create")),
):
    """Upload a SQL rollback/migration script for analysis"""
    if not file.filename.endswith('.sql'):
        raise HTTPException(status_code=400, detail="Only .sql files are allowed")

    rollback_folder = Path("../NFSShared/rollback")
    rollback_folder.mkdir(parents=True, exist_ok=True)

    original_filename = file.filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename_without_ext = original_filename.rsplit('.', 1)[0]
    file_extension = original_filename.rsplit('.', 1)[1] if '.' in original_filename else 'sql'
    unique_filename = f"{filename_without_ext}_{timestamp}.{file_extension}"

    file_path = rollback_folder / unique_filename
    content = await file.read()
    file_size = len(content)

    with open(file_path, "wb") as f:
        f.write(content)

    script = models.RollbackScript(
        filename=original_filename,
        file_path=str(file_path),
        description=description,
        uploaded_by=uploaded_by,
        file_size=file_size,
        analysis_status='pending'
    )

    db.add(script)
    db.commit()
    db.refresh(script)

    return {
        "id": script.id,
        "filename": script.filename,
        "file_size": script.file_size,
        "uploaded_at": script.uploaded_at,
        "analysis_status": script.analysis_status
    }


@router.get("/rollback/scripts")
def get_rollback_scripts(
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("rollback", "read")),
):
    """Get all uploaded rollback scripts"""
    scripts = db.query(models.RollbackScript).order_by(models.RollbackScript.uploaded_at.desc()).all()

    result = []
    for script in scripts:
        result.append({
            "id": script.id,
            "script_name": script.filename,
            "filename": script.filename,
            "description": script.description,
            "uploaded_by": script.uploaded_by,
            "uploaded_at": script.uploaded_at,
            "created_at": script.uploaded_at,
            "updated_at": script.analysis_completed_at or script.uploaded_at,
            "file_size": script.file_size,
            "file_size_bytes": script.file_size,
            "analysis_status": script.analysis_status,
            "analysis_started_at": script.analysis_started_at,
            "analysis_completed_at": script.analysis_completed_at,
            "error_message": script.error_message,
            "object_count": len(script.database_objects)
        })

    return result


@router.get("/rollback/{script_id}")
def get_rollback_script_details(
    script_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("rollback", "read")),
):
    """Get detailed information about a specific script including identified objects"""
    script = db.query(models.RollbackScript).filter(models.RollbackScript.id == script_id).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    objects_by_db = {}
    for obj in script.database_objects:
        db_name = obj.database_name or "default"
        if db_name not in objects_by_db:
            objects_by_db[db_name] = {
                "tables": [],
                "stored_procedures": [],
                "functions": [],
                "views": [],
                "triggers": [],
                "indexes": [],
                "user_types": [],
                "table_types": []
            }

        if obj.object_type == "table":
            objects_by_db[db_name]["tables"].append(obj.object_name)
        elif obj.object_type == "stored_procedure":
            objects_by_db[db_name]["stored_procedures"].append(obj.object_name)
        elif obj.object_type == "function":
            objects_by_db[db_name]["functions"].append(obj.object_name)
        elif obj.object_type == "view":
            objects_by_db[db_name]["views"].append(obj.object_name)
        elif obj.object_type == "trigger":
            objects_by_db[db_name]["triggers"].append(obj.object_name)
        elif obj.object_type == "index":
            objects_by_db[db_name]["indexes"].append(obj.object_name)
        elif obj.object_type == "user_type":
            objects_by_db[db_name]["user_types"].append(obj.object_name)
        elif obj.object_type == "table_type":
            objects_by_db[db_name]["table_types"].append(obj.object_name)

    return {
        "id": script.id,
        "filename": script.filename,
        "description": script.description,
        "uploaded_by": script.uploaded_by,
        "uploaded_at": script.uploaded_at,
        "file_size": script.file_size,
        "analysis_status": script.analysis_status,
        "analysis_started_at": script.analysis_started_at,
        "analysis_completed_at": script.analysis_completed_at,
        "error_message": script.error_message,
        "database_objects": objects_by_db
    }


@router.post("/rollback/{script_id}/analyze")
async def analyze_rollback_script(
    script_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("rollback", "execute")),
):
    """Analyze a script using Claude AI to identify database objects"""
    from claude_service import ClaudeAIService

    script = db.query(models.RollbackScript).filter(models.RollbackScript.id == script_id).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    script.analysis_status = 'analyzing'
    script.analysis_started_at = datetime.utcnow()
    db.commit()

    try:
        with open(script.file_path, 'r', encoding='utf-8') as f:
            script_content = f.read()

        claude_service = ClaudeAIService()
        analysis_result = await claude_service.analyze_database_script(script_content)

        db.query(models.RollbackDatabaseObject).filter(
            models.RollbackDatabaseObject.script_id == script_id
        ).delete()

        if "DbDetails" in analysis_result:
            for db_detail in analysis_result["DbDetails"]:
                db_name = db_detail.get("DbName", "")

                type_map = [
                    ("TableNames", "table"),
                    ("SpNames", "stored_procedure"),
                    ("FunctionNames", "function"),
                    ("Views", "view"),
                    ("Triggers", "trigger"),
                    ("Indexes", "index"),
                    ("UserTypes", "user_type"),
                    ("TableTypes", "table_type"),
                ]
                for key, obj_type in type_map:
                    for name in db_detail.get(key, []):
                        db.add(models.RollbackDatabaseObject(
                            script_id=script_id,
                            database_name=db_name,
                            object_type=obj_type,
                            object_name=name,
                        ))

        script.analysis_status = 'completed'
        script.analysis_completed_at = datetime.utcnow()
        script.error_message = None
        db.commit()

        return {"success": True, "message": "Analysis completed", "objects_found": len(script.database_objects)}

    except Exception as e:
        script.analysis_status = 'failed'
        script.analysis_completed_at = datetime.utcnow()
        script.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/rollback/{script_id}/download")
def download_rollback_script(
    script_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("rollback", "read")),
):
    """Download the original SQL script file"""
    script = db.query(models.RollbackScript).filter(models.RollbackScript.id == script_id).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    if not os.path.exists(script.file_path):
        raise HTTPException(status_code=404, detail="Script file not found on disk")

    return FileResponse(
        path=script.file_path,
        filename=script.filename,
        media_type='application/sql'
    )


@router.delete("/rollback/{script_id}")
def delete_rollback_script(
    script_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("rollback", "delete")),
):
    """Delete a rollback script and its file"""
    script = db.query(models.RollbackScript).filter(models.RollbackScript.id == script_id).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    if os.path.exists(script.file_path):
        os.remove(script.file_path)

    db.delete(script)
    db.commit()

    return {"success": True, "message": "Script deleted"}
