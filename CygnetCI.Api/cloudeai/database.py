# database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from urllib.parse import quote_plus
import os

# URL-encode the password to handle special characters like @
password = quote_plus("Admin@123")

# Database URL with encoded password
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://postgres:{password}@localhost:5432/CygnetCI"
)

# Create engine
engine = create_engine(DATABASE_URL)

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