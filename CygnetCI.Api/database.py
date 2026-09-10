# database.py
import logging

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import app_config

logger = logging.getLogger(__name__)

# Get database URL from config
DATABASE_URL = app_config.get_database_url()

logger.info("Connecting to database: %s at %s:%s",
            app_config.get_db_name(), app_config.get_db_host(), app_config.get_db_port())

# Create engine with larger pool to support many concurrent agents
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=40,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()