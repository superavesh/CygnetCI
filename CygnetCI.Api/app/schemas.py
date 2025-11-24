from pydantic import BaseModel, EmailStr
from typing import Optional
import datetime

# User
class UserBase(BaseModel):
    username: str
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str]
    email: Optional[EmailStr]
    is_active: Optional[bool]

class UserOut(UserBase):
    id: int
    created_at: datetime.datetime
    class Config:
        orm_mode = True

# Role
class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None

class RoleCreate(RoleBase):
    pass

class RoleUpdate(BaseModel):
    name: Optional[str]
    description: Optional[str]

class RoleOut(RoleBase):
    id: int
    class Config:
        orm_mode = True

# Right
class RightCreate(BaseModel):
    role_id: int
    name: str
    description: Optional[str]

class RightOut(BaseModel):
    id: int
    role_id: int
    name: str
    description: Optional[str]
    class Config:
        orm_mode = True

# Assignment
class AssignmentCreate(BaseModel):
    user_id: int
    role_id: int

class AssignmentOut(BaseModel):
    id: int
    user_id: int
    role_id: int
    class Config:
        orm_mode = True

# Agent
class AgentBase(BaseModel):
    name: str
    ip_address: Optional[str]
    description: Optional[str]
    is_active: Optional[bool] = True

class AgentCreate(AgentBase):
    pass

class AgentUpdate(BaseModel):
    name: Optional[str]
    ip_address: Optional[str]
    description: Optional[str]
    is_active: Optional[bool]

class AgentOut(AgentBase):
    id: int
    created_at: datetime.datetime
    class Config:
        orm_mode = True

# Pipeline
class PipelineBase(BaseModel):
    name: str
    environment: Optional[str]
    description: Optional[str]

class PipelineCreate(PipelineBase):
    pass

class PipelineUpdate(BaseModel):
    name: Optional[str]
    environment: Optional[str]
    description: Optional[str]

class PipelineOut(PipelineBase):
    id: int
    created_at: datetime.datetime
    class Config:
        orm_mode = True

# Monitoring
class MonitoringCreate(BaseModel):
    agent_id: Optional[int]
    service: str
    message: str

class MonitoringOut(MonitoringCreate):
    id: int
    created_at: datetime.datetime
    class Config:
        orm_mode = True

# Artifact / Script
class ArtifactCreate(BaseModel):
    pipeline_id: int
    name: str
    version: Optional[str]
    branch: Optional[str]
    path: Optional[str]

class ArtifactOut(ArtifactCreate):
    id: int
    created_at: datetime.datetime
    class Config:
        orm_mode = True

class ScriptCreate(BaseModel):
    client: str
    branch: Optional[str]
    name: str
    path: Optional[str]

class ScriptOut(ScriptCreate):
    id: int
    created_at: datetime.datetime
    class Config:
        orm_mode = True

# Auth token
class Token(BaseModel):
    access_token: str
    token_type: str
