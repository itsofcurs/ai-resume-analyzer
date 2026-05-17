import os
import chromadb
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/talentdb")
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_data")

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
