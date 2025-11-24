from fastapi import FastAPI
import configparser, os
from .database import engine, Base

# Load config.ini
cfg = configparser.ConfigParser()
cfg.read(os.path.join(os.getcwd(), "config.ini"))

app = FastAPI(title="CygnetCI API", version="1.0.0", description="CI/CD management API")

# include routers
from .routers import auth as auth_r, users as users_r, roles as roles_r, rights as rights_r, assignments as assignments_r
from .routers import agents as agents_r, pipelines as pipelines_r, agent_connection as agent_conn_r, monitoring as monitoring_r
from .routers import artifacts as artifacts_r, scripts as scripts_r

app.include_router(auth_r.router)
app.include_router(users_r.router)
app.include_router(roles_r.router)
app.include_router(rights_r.router)
app.include_router(assignments_r.router)
app.include_router(agents_r.router)
app.include_router(pipelines_r.router)
app.include_router(agent_conn_r.router)
app.include_router(monitoring_r.router)
app.include_router(artifacts_r.router)
app.include_router(scripts_r.router)

@app.on_event("startup")
def on_startup():
    # Create tables if not exist (for dev). Use Alembic for production migrations.
    Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {
        "status": "running",
        "environment": cfg["app"].get("environment", "dev"),
        "database": cfg["postgresql"].get("database")
    }
