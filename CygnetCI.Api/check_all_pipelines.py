from database import SessionLocal
from models import Pipeline, PipelineStep, PipelineParameter

db = SessionLocal()

# Get all pipelines
pipelines = db.query(Pipeline).all()
print(f"Found {len(pipelines)} pipelines:\n")

for pipeline in pipelines:
    print(f"Pipeline {pipeline.id}: {pipeline.name}")
    print(f"  Agent ID: {pipeline.agent_id}")
    print(f"  Description: {pipeline.description}")
    print(f"  Branch: {pipeline.branch}")

    # Get steps
    steps = db.query(PipelineStep).filter(PipelineStep.pipeline_id == pipeline.id).order_by(PipelineStep.step_order).all()
    print(f"  Steps ({len(steps)}):")
    for step in steps:
        print(f"    {step.step_order}. {step.name}: {step.command}")

    # Get parameters
    params = db.query(PipelineParameter).filter(PipelineParameter.pipeline_id == pipeline.id).all()
    print(f"  Parameters ({len(params)}):")
    for param in params:
        print(f"    {param.name} ({param.type}): {param.default_value}")
    print()

db.close()
