import configparser, os
from urllib.parse import quote
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

cfg = configparser.ConfigParser()
cfg.read(os.path.join(os.getcwd(), "config.ini"))

pg = cfg["postgresql"]
DB_USER = pg.get("user")
DB_PASS = quote(pg.get("password"))
DB_HOST = pg.get("host")
DB_PORT = pg.get("port")
DB_NAME = pg.get("database")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
