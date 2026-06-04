# models.py - Complete SQLAlchemy ORM Models for CygnetCI
from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey, Numeric, Date, CheckConstraint, Boolean, JSON, ARRAY, BigInteger
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB
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
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    parent_agent_id = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    resource_data = relationship("AgentResourceData", back_populates="agent", cascade="all, delete-orphan")
    logs = relationship("AgentLog", back_populates="agent", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="agent")
    sub_agents = relationship("Agent", foreign_keys="Agent.parent_agent_id", back_populates="parent_agent")
    parent_agent = relationship("Agent", foreign_keys="Agent.parent_agent_id", back_populates="sub_agents", remote_side="Agent.id")
    
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


class AgentWindowsService(Base):
    __tablename__ = "agent_windows_services"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    service_name = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False)
    description = Column(Text)
    reported_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('Running', 'Stopped', 'Paused', 'StartPending', 'StopPending', 'ContinuePending', 'PausePending')", name="check_service_status"),
    )


class AgentDriveInfo(Base):
    __tablename__ = "agent_drive_info"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    drive_letter = Column(String(10), nullable=False)
    drive_label = Column(String(255))
    total_gb = Column(BigInteger, nullable=False)
    used_gb = Column(BigInteger, nullable=False)
    free_gb = Column(BigInteger, nullable=False)
    percent_used = Column(Integer, nullable=False)
    reported_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("percent_used >= 0 AND percent_used <= 100", name="check_percent_used"),
    )


class AgentWebsitePing(Base):
    __tablename__ = "agent_website_pings"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    url = Column(String(500), nullable=False)
    name = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False)
    response_time_ms = Column(Integer, nullable=False)
    checked_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('healthy', 'unhealthy', 'timeout')", name="check_ping_status"),
    )


class AgentCommand(Base):
    """Commands queued for agents to execute (e.g., start/stop Windows services)"""
    __tablename__ = "agent_commands"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    command_type = Column(String(50), nullable=False)  # e.g., 'service_control'
    command_data = Column(Text, nullable=False)  # JSON data with command details
    status = Column(String(50), nullable=False, default="pending")  # pending, in_progress, completed, failed
    result = Column(Text)  # JSON result or error message
    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())
    started_at = Column(TIMESTAMP)
    completed_at = Column(TIMESTAMP)

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'in_progress', 'completed', 'failed')", name="check_command_status"),
        CheckConstraint("command_type IN ('service_control', 'execute_script', 'system_command')", name="check_command_type"),
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
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    log_verbose_output = Column(Boolean, default=False, nullable=False, server_default="false")
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
    shell_type = Column(String(20), nullable=False, default='cmd')
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    pipeline = relationship("Pipeline", back_populates="steps")

    __table_args__ = (
        CheckConstraint("shell_type IN ('powershell', 'cmd', 'bash')", name="check_shell_type"),
    )


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
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"))
    agent_name = Column(String(255))
    status = Column(String(50), nullable=False)
    started_at = Column(TIMESTAMP, nullable=True, server_default=func.now())
    completed_at = Column(TIMESTAMP)
    duration = Column(String(50))
    commit = Column(String(255))
    triggered_by = Column(String(255))
    # DAG tracking — links this execution back to the release graph node
    release_execution_id = Column(Integer, ForeignKey("release_executions.id", ondelete="SET NULL"), nullable=True)
    release_pipeline_id = Column(Integer, ForeignKey("release_pipelines.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    pipeline = relationship("Pipeline", back_populates="executions")
    agent = relationship("Agent")
    params = relationship("PipelineExecutionParam", back_populates="execution", cascade="all, delete-orphan")
    logs = relationship("PipelineExecutionLog", back_populates="execution", cascade="all, delete-orphan")

    __table_args__ = (
        # 'pending' = created but waiting for upstream dependency to complete
        CheckConstraint("status IN ('pending', 'running', 'success', 'failed', 'cancelled')", name="check_execution_status"),
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


class PipelineExecutionLog(Base):
    __tablename__ = "pipeline_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    pipeline_execution_id = Column(Integer, ForeignKey("pipeline_executions.id", ondelete="CASCADE"), nullable=False)
    log_level = Column(String(20), default="info")
    message = Column(Text, nullable=False)
    timestamp = Column(TIMESTAMP, server_default=func.now())
    step_name = Column(String(255))
    step_index = Column(Integer)
    source = Column(String(50), default="system")

    # Relationships
    execution = relationship("PipelineExecution", back_populates="logs")

    __table_args__ = (
        CheckConstraint("log_level IN ('debug', 'info', 'warning', 'error', 'success')", name="check_log_level"),
        CheckConstraint("source IN ('system', 'agent', 'user')", name="check_log_source"),
    )


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
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), index=True)
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


# ===================================================
# RELEASE MANAGEMENT MODELS (Azure DevOps-like)
# ===================================================

class Environment(Base):
    __tablename__ = "environments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text)
    order_index = Column(Integer, default=0)
    requires_approval = Column(Boolean, default=False)
    approvers = Column(ARRAY(Text))  # Array of user emails/names
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    release_stages = relationship("ReleaseStage", back_populates="environment")
    stage_executions = relationship("StageExecution", back_populates="environment")
    variables = relationship("Variable", back_populates="environment")


class Release(Base):
    __tablename__ = "releases"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"))
    version = Column(String(100))
    status = Column(String(50), default="active")
    created_by = Column(String(255))
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    pipeline = relationship("Pipeline")
    stages = relationship("ReleaseStage", back_populates="release", cascade="all, delete-orphan")
    pipelines = relationship("ReleasePipeline", back_populates="release", cascade="all, delete-orphan")
    executions = relationship("ReleaseExecution", back_populates="release", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("status IN ('active', 'disabled', 'archived')", name="check_release_status"),
    )


class ReleaseStage(Base):
    __tablename__ = "release_stages"

    id = Column(Integer, primary_key=True, index=True)
    release_id = Column(Integer, ForeignKey("releases.id", ondelete="CASCADE"), nullable=False)
    environment_id = Column(Integer, ForeignKey("environments.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, nullable=False)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"))
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"))
    pre_deployment_approval = Column(Boolean, default=False)
    post_deployment_approval = Column(Boolean, default=False)
    auto_deploy = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    release = relationship("Release", back_populates="stages")
    environment = relationship("Environment", back_populates="release_stages")
    pipeline = relationship("Pipeline")
    agent = relationship("Agent")
    stage_executions = relationship("StageExecution", back_populates="release_stage")


class ReleasePipeline(Base):
    __tablename__ = "release_pipelines"

    id = Column(Integer, primary_key=True, index=True)
    release_id = Column(Integer, ForeignKey("releases.id", ondelete="CASCADE"), nullable=False)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, nullable=False)
    execution_mode = Column(String(50), default="sequential")
    depends_on = Column(Integer, ForeignKey("release_pipelines.id", ondelete="SET NULL"))
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    release = relationship("Release", back_populates="pipelines")
    pipeline = relationship("Pipeline")

    __table_args__ = (
        CheckConstraint("execution_mode IN ('sequential', 'parallel')", name="check_execution_mode"),
    )


class ReleaseExecution(Base):
    __tablename__ = "release_executions"

    id = Column(Integer, primary_key=True, index=True)
    release_id = Column(Integer, ForeignKey("releases.id", ondelete="CASCADE"), nullable=False)
    release_number = Column(String(50), nullable=False)
    triggered_by = Column(String(255))
    status = Column(String(50), default="pending")
    artifact_version = Column(String(100))
    started_at = Column(TIMESTAMP)
    completed_at = Column(TIMESTAMP)
    duration_seconds = Column(Integer)
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    release = relationship("Release", back_populates="executions")
    stage_executions = relationship("StageExecution", back_populates="release_execution", cascade="all, delete-orphan")
    parameters = relationship("ReleaseExecutionParameter", back_populates="release_execution", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="release_execution")

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'in_progress', 'succeeded', 'failed', 'cancelled', 'partially_succeeded')", name="check_release_execution_status"),
    )


class StageExecution(Base):
    __tablename__ = "stage_executions"

    id = Column(Integer, primary_key=True, index=True)
    release_execution_id = Column(Integer, ForeignKey("release_executions.id", ondelete="CASCADE"), nullable=False)
    release_stage_id = Column(Integer, ForeignKey("release_stages.id", ondelete="CASCADE"), nullable=False)
    environment_id = Column(Integer, ForeignKey("environments.id", ondelete="CASCADE"), nullable=False)
    environment_name = Column(String(100))
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"))
    agent_name = Column(String(255))
    status = Column(String(50), default="pending")
    pipeline_execution_id = Column(Integer, ForeignKey("pipeline_executions.id", ondelete="SET NULL"))
    approval_status = Column(String(50), default="not_required")
    approved_by = Column(String(255))
    approved_at = Column(TIMESTAMP)
    approval_comments = Column(Text)
    started_at = Column(TIMESTAMP)
    completed_at = Column(TIMESTAMP)
    duration_seconds = Column(Integer)
    error_message = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    release_execution = relationship("ReleaseExecution", back_populates="stage_executions")
    release_stage = relationship("ReleaseStage", back_populates="stage_executions")
    environment = relationship("Environment", back_populates="stage_executions")
    agent = relationship("Agent")
    pipeline_execution = relationship("PipelineExecution")
    logs = relationship("StageExecutionLog", back_populates="stage_execution", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'awaiting_approval', 'in_progress', 'succeeded', 'failed', 'cancelled', 'skipped')", name="check_stage_execution_status"),
        CheckConstraint("approval_status IN ('not_required', 'pending', 'approved', 'rejected')", name="check_approval_status"),
    )


class StageExecutionLog(Base):
    __tablename__ = "stage_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    stage_execution_id = Column(Integer, ForeignKey("stage_executions.id", ondelete="CASCADE"), nullable=False)
    log_level = Column(String(20), default="info")
    message = Column(Text, nullable=False)
    timestamp = Column(TIMESTAMP, server_default=func.now())
    task_name = Column(String(255))
    source = Column(String(50), default="system")

    # Relationships
    stage_execution = relationship("StageExecution", back_populates="logs")

    __table_args__ = (
        CheckConstraint("log_level IN ('debug', 'info', 'warning', 'error', 'success')", name="check_stage_log_level"),
        CheckConstraint("source IN ('system', 'agent', 'user')", name="check_stage_log_source"),
    )


class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    version = Column(String(100), nullable=False)
    artifact_type = Column(String(50), default="build")
    pipeline_execution_id = Column(Integer, ForeignKey("pipeline_executions.id", ondelete="CASCADE"))
    release_execution_id = Column(Integer, ForeignKey("release_executions.id", ondelete="CASCADE"))
    storage_path = Column(Text)
    download_url = Column(Text)
    size_bytes = Column(BigInteger)
    checksum = Column(String(255))
    artifact_metadata = Column(JSONB)  # Renamed from 'metadata' to avoid SQLAlchemy reserved word
    created_by = Column(String(255))
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    pipeline_execution = relationship("PipelineExecution")
    release_execution = relationship("ReleaseExecution", back_populates="artifacts")

    __table_args__ = (
        CheckConstraint("artifact_type IN ('build', 'container', 'package', 'file', 'other')", name="check_artifact_type"),
    )


class ReleasePickup(Base):
    __tablename__ = "release_pickup"

    id = Column(Integer, primary_key=True, index=True)
    release_execution_id = Column(Integer, ForeignKey("release_executions.id", ondelete="CASCADE"), nullable=False)
    stage_execution_id = Column(Integer, ForeignKey("stage_executions.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    agent_uuid = Column(String(255), nullable=False)
    agent_name = Column(String(255))
    status = Column(String(50), default="pending")
    priority = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())
    picked_up_at = Column(TIMESTAMP)
    started_at = Column(TIMESTAMP)
    completed_at = Column(TIMESTAMP)
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Relationships
    release_execution = relationship("ReleaseExecution")
    stage_execution = relationship("StageExecution")
    agent = relationship("Agent")

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'picked_up', 'in_progress', 'completed', 'failed', 'cancelled')", name="check_release_pickup_status"),
    )


class PipelinePickup(Base):
    __tablename__ = "pipeline_pickup"

    id = Column(Integer, primary_key=True, index=True)
    pipeline_execution_id = Column(Integer, ForeignKey("pipeline_executions.id", ondelete="CASCADE"), nullable=False)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False)
    pipeline_name = Column(String(255))
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    agent_uuid = Column(String(255), nullable=False)
    agent_name = Column(String(255))
    status = Column(String(50), default="pending")
    priority = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())
    picked_up_at = Column(TIMESTAMP)
    started_at = Column(TIMESTAMP)
    completed_at = Column(TIMESTAMP)
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Relationships
    pipeline_execution = relationship("PipelineExecution")
    pipeline = relationship("Pipeline")
    agent = relationship("Agent")

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'picked_up', 'in_progress', 'completed', 'failed', 'cancelled')", name="check_pipeline_pickup_status"),
    )


class VariableGroup(Base):
    __tablename__ = "variable_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text)
    created_by = Column(String(255))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    variables = relationship("Variable", back_populates="variable_group", cascade="all, delete-orphan")


class Variable(Base):
    __tablename__ = "variables"

    id = Column(Integer, primary_key=True, index=True)
    variable_group_id = Column(Integer, ForeignKey("variable_groups.id", ondelete="CASCADE"), nullable=False)
    environment_id = Column(Integer, ForeignKey("environments.id", ondelete="CASCADE"))  # NULL for shared variables
    key = Column(String(255), nullable=False)
    value = Column(Text)
    is_secret = Column(Boolean, default=False)
    description = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    variable_group = relationship("VariableGroup", back_populates="variables")
    environment = relationship("Environment", back_populates="variables")


class ReleaseExecutionParameter(Base):
    __tablename__ = "release_execution_parameters"

    id = Column(Integer, primary_key=True, index=True)
    release_execution_id = Column(Integer, ForeignKey("release_executions.id", ondelete="CASCADE"), nullable=False)
    parameter_name = Column(String(255), nullable=False)
    parameter_value = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    release_execution = relationship("ReleaseExecution", back_populates="parameters")


# ===================================================
# FILE TRANSFER MODELS
# ===================================================

class TransferFile(Base):
    __tablename__ = "transfer_files"

    id = Column(Integer, primary_key=True, index=True)
    file_type = Column(String(50), nullable=False)
    file_name = Column(String(255), nullable=False)
    version = Column(String(100), nullable=False)
    file_path = Column(Text, nullable=False)
    file_size_bytes = Column(BigInteger)
    checksum = Column(String(255))
    uploaded_by = Column(String(255))
    description = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    pickups = relationship("TransferFilePickup", back_populates="transfer_file", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("file_type IN ('script', 'artifact')", name="check_transfer_file_type"),
    )


class TransferFilePickup(Base):
    __tablename__ = "transfer_file_pickup"

    id = Column(Integer, primary_key=True, index=True)
    transfer_file_id = Column(Integer, ForeignKey("transfer_files.id", ondelete="CASCADE"), nullable=False)
    agent_uuid = Column(String(255), nullable=False)
    agent_name = Column(String(255))
    file_type = Column(String(50), nullable=False)
    version = Column(String(100), nullable=False)
    status = Column(String(50), default="pending")
    requested_by = Column(String(255))
    requested_at = Column(TIMESTAMP, server_default=func.now())
    downloaded_at = Column(TIMESTAMP)
    acknowledged_at = Column(TIMESTAMP)
    error_message = Column(Text)

    # Relationships
    transfer_file = relationship("TransferFile", back_populates="pickups")

    __table_args__ = (
        CheckConstraint("file_type IN ('script', 'artifact')", name="check_pickup_file_type"),
        CheckConstraint("status IN ('pending', 'downloading', 'downloaded', 'failed')", name="check_pickup_status"),
    )


# ===================================================
# CUSTOMER/TENANT MODELS
# ===================================================

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)  # Unique identifier (slug/code)
    display_name = Column(String(255), nullable=False)  # Display name for UI
    description = Column(Text)
    contact_email = Column(String(255))
    contact_phone = Column(String(50))
    address = Column(Text)
    is_active = Column(Boolean, default=True, nullable=False)
    logo_url = Column(String(500))
    settings = Column(JSONB)  # For customer-specific configuration
    client_id = Column(String(64), nullable=True, unique=True)
    client_secret = Column(String(128), nullable=True)
    credentials_enabled = Column(Boolean, default=False, nullable=False)
    ip_allowlist = Column(JSONB, nullable=True)          # list of IPs / CIDRs / ranges
    ip_restriction_enabled = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships to other entities (cascade delete customer data when customer is deleted)
    user_customers = relationship("UserCustomer", back_populates="customer", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255))
    password_hash = Column(String(255), nullable=False)  # Matches existing DB column name
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)
    last_login = Column(TIMESTAMP)
    created_by = Column(Integer)  # Matches existing DB column

    # Relationships
    user_customers = relationship("UserCustomer", back_populates="user", cascade="all, delete-orphan")


class UserCustomer(Base):
    """
    Many-to-many relationship between users and customers
    Allows users to be assigned to multiple customers/tenants
    """
    __tablename__ = "user_customers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    is_default = Column(Boolean, default=False, nullable=False)  # Default customer for this user
    assigned_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="user_customers")
    customer = relationship("Customer", back_populates="user_customers")


# ==================== RBAC MODELS ====================

class Role(Base):
    """
    Roles for Role-Based Access Control (RBAC)
    Each role has a set of permissions for different resources
    """
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text)
    permissions = Column(JSONB, nullable=False)  # {"resource": ["action1", "action2"]}
    is_system = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)


class AuditLog(Base):
    """
    Audit trail for tracking user actions and system changes
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(100), nullable=False, index=True)
    resource_id = Column(String(100))
    details = Column(JSONB)
    ip_address = Column(String(50))
    user_agent = Column(String(500))
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False, index=True)
    created_by = Column(Integer)

    # Relationship
    user = relationship("User")


# ==================== ROLLBACK MANAGEMENT MODELS ====================

class RollbackScript(Base):
    """
    Stores uploaded rollback/migration scripts for analysis
    """
    __tablename__ = "rollback_scripts"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    description = Column(Text)
    uploaded_by = Column(String(255))
    uploaded_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    file_size = Column(BigInteger)  # File size in bytes
    analysis_status = Column(String(50), default='pending', nullable=False)  # pending, analyzing, completed, failed
    analysis_started_at = Column(TIMESTAMP)
    analysis_completed_at = Column(TIMESTAMP)
    error_message = Column(Text)  # Store any error that occurred during analysis

    # Relationships
    database_objects = relationship("RollbackDatabaseObject", back_populates="script", cascade="all, delete-orphan")


class RollbackDatabaseObject(Base):
    """
    Stores database objects identified from rollback scripts by Claude AI
    """
    __tablename__ = "rollback_database_objects"

    id = Column(Integer, primary_key=True, index=True)
    script_id = Column(Integer, ForeignKey("rollback_scripts.id", ondelete="CASCADE"), nullable=False, index=True)
    database_name = Column(String(255))
    object_type = Column(String(50), nullable=False, index=True)  # table, stored_procedure, function, view, trigger, index, user_type, table_type
    object_name = Column(String(500), nullable=False, index=True)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)

    # Relationships
    script = relationship("RollbackScript", back_populates="database_objects")


# ==================== EMAIL ALERTS MODELS ====================

class EmailAlert(Base):
    """
    Email alerts for monitoring and notifications
    Supports categorization: inbox, ignorable, moderate, critical, resolved
    """
    __tablename__ = "email_alerts"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String(500), nullable=False)
    sender = Column(String(255), nullable=False)
    sender_email = Column(String(255), nullable=False)
    preview = Column(String(500))
    body = Column(Text)
    received_at = Column(TIMESTAMP, server_default=func.now(), nullable=False, index=True)
    category = Column(String(50), nullable=False, default='inbox', index=True)  # inbox, ignorable, moderate, critical, resolved
    is_read = Column(Boolean, default=False, nullable=False)
    is_starred = Column(Boolean, default=False, nullable=False)
    has_attachment = Column(Boolean, default=False, nullable=False)
    priority = Column(String(20), default='medium', nullable=False)  # low, medium, high
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("category IN ('inbox', 'ignorable', 'moderate', 'critical', 'resolved')", name="check_email_category"),
        CheckConstraint("priority IN ('low', 'medium', 'high')", name="check_email_priority"),
    )


# ==================== TICKETING MODELS ====================

class Ticket(Base):
    """Support/issue tickets with resolution tracking"""
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String(20), unique=True, nullable=False, index=True)  # TKT-0001
    title = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(20), nullable=False, default="open")
    priority = Column(String(20), nullable=False, default="medium")
    type = Column(String(20), nullable=False, default="task")

    # People
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Optional links
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True)
    release_id = Column(Integer, ForeignKey("releases.id", ondelete="SET NULL"), nullable=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)

    # Resolution
    root_cause = Column(Text)
    resolution_steps = Column(JSONB)   # array of strings
    resolution_commands = Column(Text)
    resolved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = Column(TIMESTAMP)

    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('open', 'in_progress', 'resolved', 'closed')", name="check_ticket_status"),
        CheckConstraint("priority IN ('critical', 'high', 'medium', 'low')", name="check_ticket_priority"),
        CheckConstraint("type IN ('bug', 'task', 'improvement', 'question')", name="check_ticket_type"),
    )


class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False, unique=True)
    file_size = Column(Integer)
    mime_type = Column(String(100))
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)


class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    edited_at = Column(TIMESTAMP)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)


class TicketHistory(Base):
    __tablename__ = "ticket_history"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    changed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    field_name = Column(String(100), nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)


class TicketApproval(Base):
    __tablename__ = "ticket_approvals"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    note = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    reviewed_at = Column(TIMESTAMP)

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="check_approval_status"),
    )


class AISettings(Base):
    __tablename__ = "ai_settings"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50), nullable=False, default="anthropic")
    model = Column(String(100), nullable=False, default="claude-sonnet-4-6")
    api_key_encrypted = Column(Text)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class AlertSettings(Base):
    __tablename__ = "alert_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(String(255), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class EmailConfig(Base):
    """
    Email server configuration for fetching emails
    Stores IMAP/POP3 credentials securely
    """
    __tablename__ = "email_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)  # Config name (e.g., "Work Email", "Alerts Inbox")
    email_address = Column(String(255), nullable=False)
    server_type = Column(String(20), nullable=False, default='imap')  # imap, pop3
    server_host = Column(String(255), nullable=False)
    server_port = Column(Integer, nullable=False, default=993)
    username = Column(String(255), nullable=False)
    password_encrypted = Column(Text, nullable=False)  # Encrypted password
    use_ssl = Column(Boolean, default=True, nullable=False)
    folder = Column(String(255), default='INBOX')  # Folder to fetch from
    is_active = Column(Boolean, default=True, nullable=False)
    last_sync_at = Column(TIMESTAMP)
    last_sync_status = Column(String(50))  # success, failed
    last_sync_message = Column(Text)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("server_type IN ('imap', 'pop3')", name="check_server_type"),
    )