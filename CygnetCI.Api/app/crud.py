from sqlalchemy.orm import Session
from . import models, schemas
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Users
def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def create_user(db: Session, user_in: schemas.UserCreate):
    hashed = pwd_context.hash(user_in.password)
    user = models.User(username=user_in.username, full_name=user_in.full_name, email=user_in.email, hashed_password=hashed)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def update_user(db: Session, user_id: int, data: dict):
    db.query(models.User).filter(models.User.id == user_id).update(data)
    db.commit()
    return get_user(db, user_id)

def delete_user(db: Session, user_id: int):
    db.query(models.User).filter(models.User.id == user_id).delete()
    db.commit()
    return True

# Roles
def create_role(db: Session, role_in: schemas.RoleCreate):
    role = models.Role(name=role_in.name, description=role_in.description)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role

def get_role(db: Session, role_id: int):
    return db.query(models.Role).filter(models.Role.id == role_id).first()

def update_role(db: Session, role_id: int, data: dict):
    db.query(models.Role).filter(models.Role.id == role_id).update(data)
    db.commit()
    return get_role(db, role_id)

def delete_role(db: Session, role_id: int):
    db.query(models.Role).filter(models.Role.id == role_id).delete()
    db.commit()
    return True

# Rights
def create_right(db: Session, right_in: schemas.RightCreate):
    right = models.Right(role_id=right_in.role_id, name=right_in.name, description=right_in.description)
    db.add(right)
    db.commit()
    db.refresh(right)
    return right

def delete_right(db: Session, right_id: int):
    db.query(models.Right).filter(models.Right.id == right_id).delete()
    db.commit()
    return True

# Assignments
def assign_role(db: Session, assign_in: schemas.AssignmentCreate):
    ur = models.UserRole(user_id=assign_in.user_id, role_id=assign_in.role_id)
    db.add(ur)
    db.commit()
    db.refresh(ur)
    return ur

def edit_assignment(db: Session, assignment_id: int, new_role_id: int):
    db.query(models.UserRole).filter(models.UserRole.id == assignment_id).update({"role_id": new_role_id})
    db.commit()
    return db.query(models.UserRole).filter(models.UserRole.id == assignment_id).first()

def delete_assignment(db: Session, assignment_id: int):
    db.query(models.UserRole).filter(models.UserRole.id == assignment_id).delete()
    db.commit()
    return True

# Agents
def create_agent(db: Session, agent_in: schemas.AgentCreate):
    a = models.Agent(**agent_in.dict())
    db.add(a)
    db.commit()
    db.refresh(a)
    return a

def get_agent(db: Session, agent_id: int):
    return db.query(models.Agent).filter(models.Agent.id == agent_id).first()

def update_agent(db: Session, agent_id: int, data: dict):
    db.query(models.Agent).filter(models.Agent.id == agent_id).update(data)
    db.commit()
    return get_agent(db, agent_id)

def delete_agent(db: Session, agent_id: int):
    db.query(models.Agent).filter(models.Agent.id == agent_id).delete()
    db.commit()
    return True

# Pipelines
def create_pipeline(db: Session, pipeline_in: schemas.PipelineCreate):
    p = models.Pipeline(**pipeline_in.dict())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p

def get_pipeline(db: Session, pipeline_id: int):
    return db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()

def update_pipeline(db: Session, pipeline_id: int, data: dict):
    db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).update(data)
    db.commit()
    return get_pipeline(db, pipeline_id)

def delete_pipeline(db: Session, pipeline_id: int):
    db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).delete()
    db.commit()
    return True

# AgentConnection
def create_agent_connection(db: Session, data: dict):
    ac = models.AgentConnection(**data)
    db.add(ac)
    db.commit()
    db.refresh(ac)
    return ac

# Monitoring logs
def create_monitoring(db: Session, log_in: schemas.MonitoringCreate):
    ml = models.MonitoringLog(**log_in.dict())
    db.add(ml)
    db.commit()
    db.refresh(ml)
    return ml

# Artifacts & Scripts
def create_artifact(db: Session, art_in: schemas.ArtifactCreate):
    a = models.Artifact(**art_in.dict())
    db.add(a)
    db.commit()
    db.refresh(a)
    return a

def create_script(db: Session, script_in: schemas.ScriptCreate):
    s = models.Script(**script_in.dict())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s
