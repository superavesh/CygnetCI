from database import SessionLocal
from models import PipelineExecution, PipelineExecutionLog

db = SessionLocal()

# Get recent executions
executions = db.query(PipelineExecution).order_by(PipelineExecution.id.desc()).limit(10).all()
print(f"Found {len(executions)} recent pipeline executions:\n")

for execution in executions:
    logs_count = db.query(PipelineExecutionLog).filter(
        PipelineExecutionLog.pipeline_execution_id == execution.id
    ).count()

    print(f"Execution ID: {execution.id}")
    print(f"  Pipeline ID: {execution.pipeline_id}")
    print(f"  Status: {execution.status}")
    print(f"  Started: {execution.started_at}")
    print(f"  Logs: {logs_count}")
    print()

db.close()
