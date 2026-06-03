import chromadb
from motor.motor_asyncio import AsyncIOMotorClient

from core.config import get_settings

settings = get_settings()

MONGODB_URI = settings.mongodb_uri
CHROMA_DB_PATH = settings.chroma_db_path

# MongoDB Setup
mongo_client = AsyncIOMotorClient(MONGODB_URI)
db = mongo_client.get_database("talentdb")
resumes_collection = db.get_collection("resumes")

# ChromaDB Setup
chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
try:
    collection = chroma_client.get_or_create_collection(name="resumes")
except Exception as e:
    print(f"Error initializing ChromaDB: {e}")
    collection = None

def get_mongo_collection():
    return resumes_collection

def get_chroma_collection():
    return collection


async def mongo_health_check() -> bool:
    try:
        await mongo_client.admin.command("ping")
        return True
    except Exception:
        return False


def chroma_health_check() -> bool:
    return collection is not None
