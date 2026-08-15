"""
Script to update all endpoint tags to the new organized structure
"""

# Tag mapping: old_tag -> new_tag
TAG_MAPPING = {
    # UI Tags
    "System": "🌐 UI - System",
    "Data": "🌐 UI - Dashboard",
    "Agents": "🌐 UI - Agents",
    "Pipelines": "🌐 UI - Pipelines",
    "Pipeline Execution": "🌐 UI - Pipeline Execution",
    "Releases": "🌐 UI - Releases",
    "Release Execution": "🌐 UI - Release Execution",
    "Tasks": "🌐 UI - Tasks",
    "Services": "🌐 UI - Services",
    "File Transfer": "🌐 UI - File Management",

    # Agent Tags - need to determine which endpoints are agent-specific
    "Agent Communication": "🤖 Agent - Registration & Health",  # Will need manual review
}

# Read the main.py file
with open('main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace each tag
for old_tag, new_tag in TAG_MAPPING.items():
    # Replace in tags parameter
    content = content.replace(f'tags=["{old_tag}"]', f'tags=["{new_tag}"]')

# Now we need to handle Agent Communication endpoints more precisely
# Let's identify agent-specific endpoints

# Agent Registration & Health endpoints
agent_health_patterns = [
    ('POST /agents"', 'tags=["🤖 Agent - Registration & Health"]'),  # Register
    ('/heartbeat"', 'tags=["🤖 Agent - Registration & Health"]'),  # Heartbeat
]

# Agent Task Execution endpoints
agent_task_patterns = [
    ('/tasks/agent/', 'tags=["🤖 Agent - Task Execution"]'),  # Get pending tasks
    ('/tasks/{task_id}/logs"', 'tags=["🤖 Agent - Task Execution"]'),  # Stream logs
    ('/tasks/{task_id}/complete"', 'tags=["🤖 Agent - Task Execution"]'),  # Complete task
]

# Agent Release Execution endpoints
agent_release_patterns = [
    ('/releases/pickup/', 'tags=["🤖 Agent - Release Execution"]'),  # Get/acknowledge/start/complete/log
]

# Agent File Transfer endpoints
agent_file_patterns = [
    ('/transfer/agent/', 'tags=["🤖 Agent - File Transfer"]'),  # Get pending downloads
    ('/transfer/download/', 'tags=["🤖 Agent - File Transfer"]'),  # Download file
    ('/transfer/acknowledge/', 'tags=["🤖 Agent - File Transfer"]'),  # Acknowledge download
]

print("Tag mapping complete!")
print("\nNote: Some endpoints tagged as 'Agent Communication' need manual review.")
print("These patterns should be agent-specific:")
print("  - /agents (POST) - Registration")
print("  - /agents/{uuid}/heartbeat - Heartbeat")
print("  - /tasks/agent/* - Task polling")
print("  - /tasks/{id}/logs - Task logs")
print("  - /tasks/{id}/complete - Task completion")
print("  - /releases/pickup/* - Release pickup operations")
print("  - /transfer/agent/* - File transfer operations")
print("\nPlease run the actual replacement manually or review the patterns above.")

# Write back
with open('main.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n✓ Basic tag replacements completed in main.py")
print("✓ Manual review needed for Agent Communication endpoints")
