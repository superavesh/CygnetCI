# customer_api.py - Customer API endpoints
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime

from database import get_db
from models import Customer, Agent, Pipeline, Release, Service, User, UserCustomer

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

class CustomerResponse(CustomerBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

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
    db: Session = Depends(get_db)
):
    """Get all customers with optional filtering"""
    query = db.query(Customer)

    # Support both is_active and active_only parameters
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)
    elif active_only is not None:
        query = query.filter(Customer.is_active == active_only)

    customers = query.offset(skip).limit(limit).all()
    return customers

@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    """Get a specific customer by ID"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

@router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    """Create a new customer"""
    # Check if customer with same name already exists
    existing = db.query(Customer).filter(Customer.name == customer.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this name already exists")

    db_customer = Customer(**customer.model_dump())
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: int, customer: CustomerUpdate, db: Session = Depends(get_db)):
    """Update a customer"""
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Update only provided fields
    update_data = customer.model_dump(exclude_unset=True)

    # Check name uniqueness if name is being updated
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
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    """Delete a customer (soft delete by setting is_active=False)"""
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Soft delete - set is_active to False instead of actually deleting
    db_customer.is_active = False
    db_customer.updated_at = datetime.utcnow()
    db.commit()
    return None

@router.get("/{customer_id}/statistics", response_model=CustomerStatistics)
def get_customer_statistics(customer_id: int, db: Session = Depends(get_db)):
    """Get statistics for a specific customer"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Count total agents
    total_agents = db.query(Agent).filter(Agent.customer_id == customer_id).count()

    # Count online agents
    online_agents = db.query(Agent).filter(
        Agent.customer_id == customer_id,
        Agent.status == "online"
    ).count()

    # Count total pipelines
    total_pipelines = db.query(Pipeline).filter(Pipeline.customer_id == customer_id).count()

    # Count successful pipelines
    successful_pipelines = db.query(Pipeline).filter(
        Pipeline.customer_id == customer_id,
        Pipeline.status == "success"
    ).count()

    # Count total releases
    total_releases = db.query(Release).filter(Release.customer_id == customer_id).count()

    # Count total services
    total_services = db.query(Service).filter(Service.customer_id == customer_id).count()

    # Count total users (through UserCustomer many-to-many relationship)
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
