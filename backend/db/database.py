"""
CropShield — Database Connection
SQLAlchemy engine, session factory, Base declarative class
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.utils.config import settings

# ── Engine ───────────────────────────────────────────────────
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

# ── Session ──────────────────────────────────────────────────
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── Base ─────────────────────────────────────────────────────
Base = declarative_base()


# ── Dependency for FastAPI routes ────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def auto_migrate_sqlite():
    """Checks for newly added columns in model definitions and executes ALTER TABLE ADD COLUMN on SQLite."""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    import sqlite3
    db_file = settings.DATABASE_URL.replace("sqlite:///", "")
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        for table_name, table in Base.metadata.tables.items():
            cursor.execute(f"PRAGMA table_info({table_name})")
            existing_cols = {c[1] for c in cursor.fetchall()}
            if not existing_cols:
                continue
            for col in table.columns:
                if col.name not in existing_cols:
                    col_type = str(col.type)
                    if "JSON" in col_type:
                        col_type = "JSON"
                    elif "VARCHAR" in col_type or "STRING" in col_type or "TEXT" in col_type:
                        col_type = "TEXT"
                    elif "FLOAT" in col_type or "NUMERIC" in col_type:
                        col_type = "REAL"
                    elif "INT" in col_type:
                        col_type = "INTEGER"
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}")
                    conn.commit()
        conn.close()
    except Exception:
        pass

