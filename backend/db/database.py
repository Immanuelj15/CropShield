"""
CropShield — Database Connection
SQLAlchemy engine, session factory, Base declarative class
"""

import logging

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.utils.config import settings

logger = logging.getLogger("cropshield.database")

_IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")
SQLITE_BUSY_TIMEOUT_SECONDS = 15

# ── Engine ───────────────────────────────────────────────────
connect_args = {}
if _IS_SQLITE:
    connect_args = {"check_same_thread": False, "timeout": SQLITE_BUSY_TIMEOUT_SECONDS}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

if _IS_SQLITE:
    @event.listens_for(engine, "connect")
    def _sqlite_on_connect(dbapi_connection, connection_record):
        """WAL lets readers proceed during writes; busy_timeout waits instead of failing on lock collisions."""
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_SECONDS * 1000}")
            cursor.execute("PRAGMA synchronous=NORMAL")
        except Exception as e:
            logger.warning("Could not apply SQLite PRAGMAs (WAL/busy_timeout): %s", e)
        finally:
            cursor.close()

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
    conn = None
    try:
        conn = sqlite3.connect(db_file, timeout=SQLITE_BUSY_TIMEOUT_SECONDS)
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
                    try:
                        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}")
                        conn.commit()
                        logger.info("SQLite auto-migrate: added column %s.%s (%s)", table_name, col.name, col_type)
                    except Exception as col_err:
                        logger.error("SQLite auto-migrate failed adding %s.%s: %s", table_name, col.name, col_err)
    except Exception as e:
        logger.error("SQLite auto-migrate failed: %s", e)
    finally:
        if conn is not None:
            conn.close()

