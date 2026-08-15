from database import SessionLocal
from models import Pipeline, PipelineStep, PipelineParameter

db = SessionLocal()

# Get pipeline 19
pipeline = db.query(Pipeline).filter(Pipeline.id == 19).first()
if pipeline:
    print(f"Pipeline {pipeline.id}: {pipeline.name}")
    print(f"  Agent ID: {pipeline.agent_id}")
    print(f"  Description: {pipeline.description}")
    print(f"  Branch: {pipeline.branch}")

    # Get steps
    steps = db.query(PipelineStep).filter(PipelineStep.pipeline_id == 19).order_by(PipelineStep.pipeline_order).all()
    print(f"  Steps ({len(steps)}):")
    for step in steps:
        print(f"    {step.pipeline_order}. {step.name}: {step.command}")

    # Get parameters
    params = db.query(PipelineParameter).filter(PipelineParameter.pipeline_id == 19).all()
    print(f"  Parameters ({len(params)}):")
    for param in params:
        print(f"    {param.name} ({param.param_type}): {param.default_value}")
else:
    print("Pipeline 19 not found")

db.close()
