"""
ai-service/scripts/setup_mongo_indexes.py
-----------------------------------------
Idempotent script to apply optimized indexes to the MongoDB Resume collection.
"""

import asyncio
import logging
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pymongo import IndexModel, ASCENDING, DESCENDING
from core.config import get_settings
from database import get_mongo_collection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def setup_indexes():
    """
    Creates Compound, Status, and TTL indexes for optimized querying and storage.
    """
    logger.info("Connecting to MongoDB to establish optimized indexes...")
    try:
        collection = await get_mongo_collection()
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        return

    # 1. Compound Index: Organization and UploadedBy
    # Accelerates recruiter dashboard queries like: "Show all my resumes"
    compound_idx = IndexModel(
        [("organizationId", ASCENDING), ("uploadedBy", ASCENDING)],
        name="idx_org_user",
        background=True
    )

    # 2. Status Index: Status and CreatedAt
    # Accelerates job queue processing and dashboard filtering
    status_idx = IndexModel(
        [("status", ASCENDING), ("createdAt", DESCENDING)],
        name="idx_status_created",
        background=True
    )

    # 3. TTL Index: Auto-delete FAILED resumes after 30 days
    # Note: MongoDB TTL indexes only support a single datetime field. To only delete FAILED
    # resumes, we use a Partial Filter Expression.
    ttl_idx = IndexModel(
        [("createdAt", ASCENDING)],
        name="idx_ttl_failed_30d",
        expireAfterSeconds=2592000,  # 30 days
        partialFilterExpression={"status": "FAILED"},
        background=True
    )

    try:
        logger.info("Creating indexes (this may take a moment if data is large)...")
        # create_indexes is idempotent; existing identical indexes are ignored.
        results = await collection.create_indexes([compound_idx, status_idx, ttl_idx])
        logger.info(f"Indexes established: {results}")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")

if __name__ == "__main__":
    asyncio.run(setup_indexes())
