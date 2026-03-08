"""
Database connection and session management
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis
from sqlalchemy import inspect, text
from app.config import settings
import socket

Base = declarative_base()


def _add_missing_columns(connection):
    """Auto-migrate: add any columns defined in models but missing from DB tables."""
    inspector = inspect(connection)
    for table_name, table in Base.metadata.tables.items():
        if not inspector.has_table(table_name):
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
        for col in table.columns:
            if col.name not in existing_cols:
                col_type = col.type.compile(connection.engine.dialect)
                default = ""
                if col.default is not None and col.default.arg is not None:
                    d = col.default.arg
                    if isinstance(d, bool):
                        default = f" DEFAULT {1 if d else 0}"
                    elif isinstance(d, (int, float)):
                        default = f" DEFAULT {d}"
                    elif isinstance(d, str):
                        default = f" DEFAULT '{d}'"
                connection.execute(text(
                    f'ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}{default}'
                ))

# Database engine and session - initialized in init_postgres()
_engine = None
_async_session_local = None

# Demo mode flag
DEMO_MODE = False

# MongoDB
mongo_client: "AsyncIOMotorClient | None" = None
mongo_db = None

# Redis
redis_client: "redis.Redis | None" = None


def _check_postgres_available():
    """Check if PostgreSQL server is reachable"""
    try:
        # Parse the host from URL
        import re
        match = re.search(r'@([^:/]+)', settings.POSTGRES_URL)
        if match:
            host = match.group(1)
            # Try to resolve the hostname
            socket.getaddrinfo(host, 5432, socket.AF_INET, socket.SOCK_STREAM)
            return True
    except Exception:
        pass
    return False


async def init_postgres():
    """Initialize PostgreSQL database (or SQLite in demo mode)"""
    global _engine, _async_session_local, DEMO_MODE
    
    # Check if PostgreSQL is available before creating engine
    if _check_postgres_available():
        try:
            _engine = create_async_engine(
                settings.POSTGRES_URL,
                echo=settings.DEBUG,
                pool_size=10,
                max_overflow=20
            )
            async with _engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            print("✅ PostgreSQL connected")
        except Exception as e:
            print(f"⚠️ PostgreSQL connection failed: {e}")
            DEMO_MODE = True
    else:
        print("⚠️ PostgreSQL server not reachable")
        DEMO_MODE = True
    
    # Fallback to SQLite if PostgreSQL is not available
    if DEMO_MODE:
        print("📝 Using SQLite demo database...")
        if _engine:
            try:
                await _engine.dispose()
            except Exception:
                pass
        
        _engine = create_async_engine(
            "sqlite+aiosqlite:///./demo_database.db",
            echo=settings.DEBUG,
        )
        
        async with _engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Auto-migrate: add any missing columns to existing tables
            await conn.run_sync(_add_missing_columns)
        print("✅ SQLite demo database initialized")
    
    # Create session maker
    _async_session_local = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False
    )


async def init_mongodb():
    """Initialize MongoDB connection"""
    global mongo_client, mongo_db
    mongo_client = AsyncIOMotorClient(settings.MONGODB_URL)
    mongo_db = mongo_client[settings.MONGODB_DATABASE]
    
    # Create indexes
    await mongo_db.behavioral_logs.create_index("user_id")
    await mongo_db.behavioral_logs.create_index("timestamp")
    await mongo_db.fraud_reports.create_index("upi_id")
    await mongo_db.ml_features.create_index("transaction_id")


async def init_redis():
    """Initialize Redis connection"""
    global redis_client
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


async def get_db():
    """Get database session (PostgreSQL or SQLite in demo mode)"""
    if _async_session_local is None:
        raise RuntimeError("Database not initialized. Call init_postgres() first.")
    
    async with _async_session_local() as session:
        try:
            yield session
        finally:
            await session.close()


def get_mongodb():
    """Get MongoDB database instance"""
    return mongo_db


def get_redis():
    """Get Redis client instance"""
    return redis_client


async def close_connections():
    """Close all database connections"""
    global mongo_client, redis_client, _engine
    if mongo_client:
        mongo_client.close()
    if redis_client:
        await redis_client.close()
    if _engine:
        await _engine.dispose()
