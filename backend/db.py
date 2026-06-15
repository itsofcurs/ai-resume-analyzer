import os

import chromadb
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./talent.db")

# SQLAlchemy setup
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# ChromaDB setup
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection_name = "resumes"
try:
    vector_collection = chroma_client.get_collection(name=collection_name)
except Exception:
    vector_collection = chroma_client.create_collection(name=collection_name)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
