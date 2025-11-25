# models.py - Complete SQLAlchemy ORM Models for CygnetCI
from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey, Numeric, Date, CheckConstraint, Boolean, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime

Base = declarative_base()


# ===================================================
# AGENT MODELS
# ===================================================

class Agent(Base):
    __tablename__ = "agents"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    uuid = Column(String(255), unique=True, nullable=False)
    description = Column(Text)
    location = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="offline")
    last_seen = Column(TIMESTAMP)
    jobs = Column(Integer, default=0)
    cpu = Column(Integer, default=0)
    memory = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    resource_data = relationship("AgentResourceData", back_populates="agent", cascade="all, delete-orphan")
    logs = relationship("AgentLog", back_populates="agent", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="agent")
    
    __table_args__ = (
        CheckConstraint("status IN ('online', 'offline', 'busy')", name="check_status"),
        CheckConstraint("cpu >= 0 AND cpu <= 100", name="check_cpu"),
        CheckConstraint("memory >= 0 AND memory <= 100", name="check_memory"),
    )


class AgentResourceData(Base):
    __tablename__ = "agent_resource_data"
    
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(TIMESTAMP, nullable=False, server_default=func.now())
    cpu = Column(Integer, nullable=False)
    memory = Column(Integer, nullable=False)
    disk = Column(Integer, nullable=False)
    
    # Relationships
    agent = relationship("Agent", back_populates="resource_data")
    
    __table_args__ = (
        CheckConstraint("cpu >= 0 AND cpu <= 100", name="check_cpu_resource"),
        CheckConstraint("memory >= 0 AND memory <= 100", name="check_memory_resource"),
        CheckConstraint("disk >= 0 AND disk <= 100", name="check_disk"),
    )


class AgentLog(Base):
    __tablename__ = "agent_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(TIMESTAMP, nullable=False, server_default=func.now())
    level = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    details = Column(Text)
    
    # Relationships
    agent = relationship("Agent", back_populates="logs")
    
    __table_args__ = (
        CheckConstraint("level IN ('info', 'success', 'warning', 'error')", name="check_log_level"),
    )


# ===================================================
# PIPELINE MODELS
# ===================================================

class Pipeline(Base):
    __tablename__ = "pipelines"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(50), nullable=False, default="pending")
    branch = Column(String(255), nullable=False)
    commit = Column(String(255))
    last_run = Column(TIMESTAMP)
    duration = Column(String(50))
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    executions = relationship("PipelineExecution", back_populates="pipeline", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="pipeline")
    steps = relationship("PipelineStep", back_populates="pipeline", cascade="all, delete-orphan")
    parameters = relationship("PipelineParameter", back_populates="pipeline", cascade="all, delete-orphan")
    agent = relationship("Agent")
    
    __table_args__ = (
        CheckConstraint("status IN ('success', 'failed', 'running', 'pending')", name="check_pipeline_status"),
    )


class PipelineStep(Base):
    __tablename__ = "pipeline_steps"
    
    id = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    command = Column(Text, nullable=False)
    step_order = Column(Integer, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    pipeline = relationship("Pipeline", back_populates="steps")


class PipelineParameter(Base):
    __tablename__ = "pipeline_parameters"
    
    id = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)
    default_value = Column(Text)
    required = Column(Boolean, default=False)
    description = Column(Text)
    choices = Column(JSON)  # Store array of choices as JSON
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    pipeline = relationship("Pipeline", back_populates="parameters")
    
    __table_args__ = (
        CheckConstraint("type IN ('string', 'number', 'boolean', 'choice')", name="check_param_type"),
    )


class PipelineExecution(Base):
    __tablename__ = "pipeline_executions"
    
    id = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), nullable=False)
    started_at = Column(TIMESTAMP, nullable=False, server_default=func.now())
    completed_at = Column(TIMESTAMP)
    duration = Column(String(50))
    commit = Column(String(255))
    triggered_by = Column(String(255))
    
    # Relationships
    pipeline = relationship("Pipeline", back_populates="executions")
    params = relationship("PipelineExecutionParam", back_populates="execution", cascade="all, delete-orphan")
    
    __table_args__ = (
        CheckConstraint("status IN ('success', 'failed', 'running', 'cancelled')", name="check_execution_status"),
    )


class PipelineExecutionParam(Base):
    __tablename__ = "pipeline_execution_params"
    
    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(Integer, ForeignKey("pipeline_executions.id", ondelete="CASCADE"), nullable=False)
    param_name = Column(String(255), nullable=False)
    param_value = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    
    # Relationships
    execution = relationship("PipelineExecution", back_populates="params")


# ===================================================
# TASK MODELS
# ===================================================

class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"))
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"))
    pipeline_name = Column(String(255))
    agent_name = Column(String(255))
    status = Column(String(50), nullable=False, default="queued")
    start_time = Column(TIMESTAMP)
    end_time = Column(TIMESTAMP)
    duration = Column(String(50))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    pipeline = relationship("Pipeline", back_populates="tasks")
    agent = relationship("Agent", back_populates="tasks")
    
    __table_args__ = (
        CheckConstraint("status IN ('completed', 'running', 'queued', 'failed')", name="check_task_status"),
    )


# ===================================================
# SERVICE MODELS
# ===================================================

class Service(Base):
    __tablename__ = "services"
    
    id = Column(String(255), primary_key=True)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)
    url = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="unknown")
    category = Column(String(50), nullable=False, default="todo")
    last_check = Column(TIMESTAMP)
    response_time = Column(String(50))
    uptime = Column(Numeric(5, 2))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    health_history = relationship("ServiceHealthHistory", back_populates="service", cascade="all, delete-orphan")
    
    __table_args__ = (
        CheckConstraint("type IN ('website', 'database', 'api', 'service')", name="check_service_type"),
        CheckConstraint("status IN ('healthy', 'warning', 'critical', 'down', 'unknown')", name="check_service_status"),
        CheckConstraint("category IN ('todo', 'monitoring', 'issues', 'healthy')", name="check_service_category"),
    )


class ServiceHealthHistory(Base):
    __tablename__ = "service_health_history"
    
    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(String(255), ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(TIMESTAMP, nullable=False, server_default=func.now())
    status = Column(String(50), nullable=False)
    response_time = Column(String(50))
    
    # Relationships
    service = relationship("Service", back_populates="health_history")
    
    __table_args__ = (
        CheckConstraint("status IN ('healthy', 'warning', 'critical', 'down', 'unknown')", name="check_health_status"),
    )


# ===================================================
# STATISTICS MODEL
# ===================================================

class Statistics(Base):
    __tablename__ = "statistics"
    
    id = Column(Integer, primary_key=True, index=True)
    stat_date = Column(Date, nullable=False, unique=True)
    active_agents = Column(Integer, default=0)
    running_pipelines = Column(Integer, default=0)
    success_rate = Column(Numeric(5, 2), default=0.00)
    avg_deploy_time = Column(String(50))
    total_deployments = Column(Integer, default=0)
    successful_deployments = Column(Integer, default=0)
    failed_deployments = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())
    
    __table_args__ = (
        CheckConstraint("success_rate >= 0 AND success_rate <= 100", name="check_success_rate"),
    )