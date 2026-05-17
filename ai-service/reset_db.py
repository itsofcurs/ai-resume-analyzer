import os
import pymongo
from dotenv import load_dotenv

# Load env variables
load_dotenv('c:/Users/Rohan Ankush Jadhav/OneDrive/Desktop/AI-Resume Analyzer/backend-node/.env')

# Connect to Mongo
mongo_uri = os.getenv("MONGODB_URI")
client = pymongo.MongoClient(mongo_uri)
db = client.get_default_database()

# Reset resume status
res = db.resumes.update_one(
    {"filename": "resume (2).pdf"},
    {"$set": {"status": "PENDING"}}
)
print("RESET SUCCESS modified count:", res.modified_count)
