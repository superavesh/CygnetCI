# customer_api.py - Customer API endpoints
import secrets
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime

from database import get_db
from models import Customer, Agent, Pipeline, Release, Service, User, UserCustomer
from deps import get_allowed_customer_ids, require_customer_access, require_permission

# ==============================================
# PYDANTIC MODELS
# ==============================================

class CustomerBase(BaseModel):
    name: str
    display_name: str
    description: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    is_active: bool = True

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    name: str | None = None
    display_name: str | None = None
    description: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    is_active: bool | None = None
    ip_allowlist: list[str] | None = None

class CustomerResponse(CustomerBase):
    id: int
    # SECURITY: client_id / client_secret are intentionally NOT exposed here.
    # The HMAC secret must never appear in list/get responses. `has_credentials`
    # is a non-sensitive flag the UI uses to show whether credentials are configured.
    has_credentials: bool = False
    credentials_enabled: bool = False
    ip_allowlist: list[str] | None = None
    ip_restriction_enabled: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerCredentialsResponse(CustomerResponse):
    """Returned ONLY by the generate-credentials endpoint — surfaces the client_id and
    client_secret exactly once, at the moment of creation (AWS-style). Subsequent reads
    use CustomerResponse and never include the secret again."""
    client_id: str | None = None
    client_secret: str | None = None

class CustomerStatistics(BaseModel):
    customer_id: int
    customer_name: str
    display_name: str
    is_active: bool
    total_agents: int
    online_agents: int
    total_pipelines: int
    successful_pipelines: int
    total_releases: int
    total_services: int
    total_users: int

# ==============================================
# ROUTER
# ==============================================

router = APIRouter(prefix="/customers", tags=["customers"])

# ==============================================
# ENDPOINTS
# ==============================================

@router.get("", response_model=List[CustomerResponse])
def get_customers(
    skip: int = 0,
    limit: int = 100,
    is_active: bool | None = None,
    active_only: bool | None = None,
    db: Session = Depends(get_db),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Get customers with optional filtering, scoped to the caller's assigned customers
    (superusers see all)."""
    query = db.query(Customer)

    # Support both is_active and active_only parameters
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)
    elif active_only is not None:
        query = query.filter(Customer.is_active == active_only)

    if allowed is not None:
        query = query.filter(Customer.id.in_(allowed))

    customers = query.offset(skip).limit(limit).all()
    return customers

@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Get a specific customer by ID"""
    require_customer_access(customer_id, allowed)
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

@router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("customers", "create")),
):
    """Create a new customer"""
    existing = db.query(Customer).filter(Customer.name == customer.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this name already exists")

    db_customer = Customer(**customer.model_dump())
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int,
    customer: CustomerUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("customers", "update")),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Update a customer"""
    require_customer_access(customer_id, allowed)
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    update_data = customer.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != db_customer.name:
        existing = db.query(Customer).filter(Customer.name == update_data["name"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Customer with this name already exists")

    for key, value in update_data.items():
        setattr(db_customer, key, value)

    db_customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("customers", "delete")),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Delete a customer (soft delete by setting is_active=False)"""
    require_customer_access(customer_id, allowed)
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    db_customer.is_active = False
    db_customer.updated_at = datetime.utcnow()
    db.commit()
    return None

@router.post("/{customer_id}/activate", response_model=CustomerResponse)
def activate_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("customers", "update")),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Activate a customer"""
    require_customer_access(customer_id, allowed)
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    db_customer.is_active = True
    db_customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.post("/{customer_id}/deactivate", response_model=CustomerResponse)
def deactivate_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("customers", "update")),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Deactivate a customer"""
    require_customer_access(customer_id, allowed)
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    db_customer.is_active = False
    db_customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.post("/{customer_id}/generate-credentials", response_model=CustomerCredentialsResponse)
def generate_credentials(
    customer_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("customers", "update")),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Generate new client_id and client_secret for a customer.
    This is the ONLY endpoint that returns the secret — shown once so it can be copied
    into the agent's appsettings.json. It is never returned again on subsequent reads."""
    require_customer_access(customer_id, allowed)
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    db_customer.client_id = secrets.token_hex(32)       # 64 hex chars
    db_customer.client_secret = secrets.token_hex(64)   # 128 hex chars
    db_customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.post("/{customer_id}/toggle-credentials", response_model=CustomerResponse)
def toggle_credentials(
    customer_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("customers", "update")),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Enable or disable HMAC credential enforcement for a customer"""
    require_customer_access(customer_id, allowed)
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if not db_customer.client_id or not db_customer.client_secret:
        raise HTTPException(
            status_code=400,
            detail="Generate credentials first before enabling"
        )

    db_customer.credentials_enabled = not db_customer.credentials_enabled
    db_customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.post("/{customer_id}/toggle-ip-restriction", response_model=CustomerResponse)
def toggle_ip_restriction(
    customer_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("customers", "update")),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Enable or disable IP restriction enforcement for a customer"""
    require_customer_access(customer_id, allowed)
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if not db_customer.ip_allowlist:
        raise HTTPException(
            status_code=400,
            detail="Add at least one IP rule before enabling IP restriction"
        )

    db_customer.ip_restriction_enabled = not db_customer.ip_restriction_enabled
    db_customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.get("/{customer_id}/statistics", response_model=CustomerStatistics)
def get_customer_statistics(
    customer_id: int,
    db: Session = Depends(get_db),
    allowed: List[int] | None = Depends(get_allowed_customer_ids),
):
    """Get statistics for a specific customer"""
    require_customer_access(customer_id, allowed)
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    total_agents = db.query(Agent).filter(Agent.customer_id == customer_id).count()
    online_agents = db.query(Agent).filter(Agent.customer_id == customer_id, Agent.status == "online").count()
    total_pipelines = db.query(Pipeline).filter(Pipeline.customer_id == customer_id).count()
    successful_pipelines = db.query(Pipeline).filter(Pipeline.customer_id == customer_id, Pipeline.status == "success").count()
    total_releases = db.query(Release).filter(Release.customer_id == customer_id).count()
    total_services = db.query(Service).filter(Service.customer_id == customer_id).count()
    total_users = db.query(UserCustomer).filter(UserCustomer.customer_id == customer_id).count()

    return CustomerStatistics(
        customer_id=customer.id,
        customer_name=customer.name,
        display_name=customer.display_name,
        is_active=customer.is_active,
        total_agents=total_agents,
        online_agents=online_agents,
        total_pipelines=total_pipelines,
        successful_pipelines=successful_pipelines,
        total_releases=total_releases,
        total_services=total_services,
        total_users=total_users
    )
