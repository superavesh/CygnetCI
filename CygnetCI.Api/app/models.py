from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from .database import Base
import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(150), unique=True, nullable=False)
    full_name = Column(String(200))
    email = Column(String(200), unique=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    description = Column(Text)
    rights = relationship("Right", back_populates="role", cascade="all, delete-orphan")
    users = relationship("UserRole", back_populates="role", cascade="all, delete-orphan")

class Right(Base):
    __tablename__ = "rights"
    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"))
    name = Column(String(200), nullable=False)
    description = Column(Text)
    role = relationship("Role", back_populates="rights")

class UserRole(Base):
    __tablename__ = "user_roles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"))
    assigned_at = Column(DateTime, default=datetime.datetime.utcnow)
    user = relationship("User", back_populates="roles")
    role = relationship("Role", back_populates="users")

class Agent(Base):
    __tablename__ = "agents"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    ip_address = Column(String(100))
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Pipeline(Base):
    __tablename__ = "pipelines"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    environment = Column(String(100))
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class AgentConnection(Base):
    __tablename__ = "agent_connections"
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"))
    endpoint = Column(String(500))
    unique_number = Column(String(200))
    last_check = Column(DateTime)
    status = Column(String(50))

class MonitoringLog(Base):
    __tablename__ = "monitoring_logs"
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"))
    service = Column(String(200))
    message = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Artifact(Base):
    __tablename__ = "artifacts"
    id = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"))
    name = Column(String(300))
    version = Column(String(100))
    branch = Column(String(200))
    path = Column(String(1000))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Script(Base):
    __tablename__ = "scripts"
    id = Column(Integer, primary_key=True, index=True)
    client = Column(String(200))
    branch = Column(String(200))
    name = Column(String(300))
    path = Column(String(1000))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
