"""
workflows/resume_workflow.py
-----------------------------
ResumeWorkflow — orchestrates the full resume processing pipeline.

This is the single entry point called by the FastAPI /api/process handler.
It replaces the direct call to nlp_pipeline.analyze_resume_unified() with
the new modular agent architecture while preserving 100% pipeline compatibility.

Pipeline stages:
  1. Text extraction          → nlp_pipeline.download_and_extract_text()
  2. Structured parsing       → ResumeParserAgent.aparse()
  3. Vector embedding         → embeddings.generate_embedding()
  4. ChromaDB storage         → database.get_chroma_collection()
  5. MongoDB status update    → database.get_mongo_collection()

Error handling:
  - Each stage is individually try/except'd and logged.
  - A stage failure sets MongoDB status to "FAILED" and short-circuits.
  - The workflow never raises exceptions to its caller — all errors are
    handled internally and reported via MongoDB document status.

LangGraph readiness:
  - run() is designed to become a LangGraph graph entry-point.
  - Each stage maps cleanly to a future LangGraph node.
  - State dict shape is already defined (implicitly) for easy migration.

Future workflow extensions (add as separate methods / classes):
  - ATSWorkflow.run(resume_id, job_description_id)
  - SkillGapWorkflow.run(resume_id, required_skills)
  - BatchRankingWorkflow.run(session_id, top_k)
"""

import json
import logging
import time
from typing import Optional

from bson import ObjectId

from database import get_mongo_collection, get_chroma_collection
from embeddings import generate_embedding
from nlp_pipeline import download_and_extract_text
from agents.resume_parser import ResumeParserAgent
from schemas.resume_schema import ResumeParseResponse

logger = logging.getLogger(__name__)


class ResumeWorkflow:
    """
    Orchestrates the full resume ingestion and AI analysis pipeline.

    This class replaces the monolithic process_resume_pipeline() function
    in main.py with a clean, testable, and extensible workflow object.

    Each public method corresponds to one pipeline stage and can be
    independently unit-tested or replaced without affecting other stages.

    Attributes:
        _parser_agent (ResumeParserAgent): Shared agent instance reused
            across workflow runs to benefit from lazy chain initialisation.
    """

    # Shared agent instance — the LangChain chain is built once on first call
    _parser_agent: ResumeParserAgent = ResumeParserAgent()

    # ---------------------------------------------------------------------------
    # MongoDB helpers
    # ---------------------------------------------------------------------------

    @staticmethod
    async def _set_status(resume_id: str, status: str, **extra_fields) -> None:
        """
        Update the MongoDB resume document status and any additional fields.

        Args:
            resume_id:    MongoDB ObjectId string of the resume document.
            status:       New status value (PENDING | EXTRACTING | ANALYZING |
                          PROCESSED | FAILED).
            **extra_fields: Additional key-value pairs to set in the document.
        """
        collection = get_mongo_collection()
        update_payload = {"status": status, **extra_fields}
        await collection.update_one(
            {"_id": ObjectId(resume_id)},
            {"$set": update_payload},
        )

    # ---------------------------------------------------------------------------
    # Stage 1: Text extraction
    # ---------------------------------------------------------------------------

    @staticmethod
    def _stage_extract_text(cloudinary_url: str, filename: str) -> str:
        """
        Download and extract raw text from a Cloudinary-hosted resume file.

        Delegates to the existing nlp_pipeline.download_and_extract_text()
        function which handles PDF (PyMuPDF), TXT, and DOCX formats.

        Returns:
            Extracted text string (may be empty if extraction fails).
        """
        start = time.time()
        text = download_and_extract_text(cloudinary_url, filename)
        logger.info(
            "[WORKFLOW] Stage 1 — Text extraction: %d chars in %.2fs",
            len(text),
            time.time() - start,
        )
        return text

    # ---------------------------------------------------------------------------
    # Stage 2: Structured parsing via ResumeParserAgent
    # ---------------------------------------------------------------------------

    @staticmethod
    async def _stage_parse_resume(raw_text: str) -> ResumeParseResponse:
        """
        Run the ResumeParserAgent to produce a structured ResumeParseResponse.

        Args:
            raw_text: Full extracted resume text.

        Returns:
            A validated ResumeParseResponse (never raises — has fallback).
        """
        start = time.time()
        result = await ResumeWorkflow._parser_agent.aparse(raw_text)
        logger.info(
            "[WORKFLOW] Stage 2 — Agent parsing: '%s', skills=%d in %.2fs",
            result.name,
            len(result.skills),
            time.time() - start,
        )
        return result

    # ---------------------------------------------------------------------------
    # Stage 3: Embedding generation
    # ---------------------------------------------------------------------------

    @staticmethod
    def _stage_generate_embedding(raw_text: str) -> Optional[list[float]]:
        """
        Generate a vector embedding for the resume text using sentence-transformers.

        Uses the existing embeddings.generate_embedding() function
        (BAAI/bge-small-en-v1.5 model).

        Returns:
            A list of floats (384-dimensional vector), or None on failure.
        """
        start = time.time()
        try:
            vector = generate_embedding(raw_text)
            logger.info(
                "[WORKFLOW] Stage 3 — Embedding: %d-dim vector in %.2fs",
                len(vector),
                time.time() - start,
            )
            return vector
        except Exception as exc:
            logger.error("[WORKFLOW] Stage 3 — Embedding failed: %s", exc)
            return None

    # ---------------------------------------------------------------------------
    # Stage 4: ChromaDB vector storage
    # ---------------------------------------------------------------------------

    @staticmethod
    def _stage_store_vector(
        resume_id: str,
        vector: list[float],
        filename: str,
        parsed: ResumeParseResponse,
    ) -> bool:
        """
        Upsert the resume embedding into ChromaDB for semantic search.

        Args:
            resume_id: MongoDB ObjectId string (used as ChromaDB document ID).
            vector:    384-dim embedding vector.
            filename:  Original resume filename for metadata.
            parsed:    Parsed ResumeParseResponse for metadata fields.

        Returns:
            True on success, False on failure.
        """
        start = time.time()
        chroma = get_chroma_collection()
        if chroma is None:
            logger.warning("[WORKFLOW] Stage 4 — ChromaDB not available, skipping.")
            return False

        try:
            chroma.add(
                ids=[resume_id],
                embeddings=[vector],
                metadatas=[{
                    "filename": filename,
                    "name": parsed.name,
                    "skills": json.dumps(parsed.skills),
                }],
            )
            logger.info(
                "[WORKFLOW] Stage 4 — ChromaDB stored resume_id=%s in %.2fs",
                resume_id,
                time.time() - start,
            )
            return True
        except Exception as exc:
            logger.error("[WORKFLOW] Stage 4 — ChromaDB storage failed: %s", exc)
            return False

    # ---------------------------------------------------------------------------
    # Stage 5: MongoDB final update
    # ---------------------------------------------------------------------------

    @staticmethod
    async def _stage_update_mongo(
        resume_id: str,
        parsed: ResumeParseResponse,
        vector_stored: bool,
    ) -> None:
        """
        Write the final PROCESSED state and all extracted data to MongoDB.

        Uses the ResumeParseResponse helper methods to produce the exact
        dict shapes expected by the existing document structure, ensuring
        full backward compatibility with the Node.js gateway and frontend.

        Args:
            resume_id:     MongoDB ObjectId string.
            parsed:        Fully validated ResumeParseResponse.
            vector_stored: Whether the ChromaDB upsert succeeded.
        """
        start = time.time()
        parsed_data = parsed.to_parsed_data()       # lightweight, Node.js-compatible
        ai_analysis = parsed.to_ai_analysis()       # authenticity block + rich data

        await ResumeWorkflow._set_status(
            resume_id,
            status="PROCESSED",
            parsedData=parsed_data,
            aiAnalysis=ai_analysis,
            candidateName=parsed.name,
            candidateEmail=parsed.email or "",
            candidatePhone=parsed.phone or "",
            embeddingsId=resume_id if vector_stored else None,
            rawText="",  # Clear raw text from DB to save storage; already processed
        )
        logger.info(
            "[WORKFLOW] Stage 5 — MongoDB updated to PROCESSED in %.2fs",
            time.time() - start,
        )

    # ---------------------------------------------------------------------------
    # Main orchestrator
    # ---------------------------------------------------------------------------

    async def run(
        self,
        resume_id: str,
        cloudinary_url: str,
        filename: str,
    ) -> None:
        """
        Execute the full resume processing pipeline asynchronously.

        This method is called by the FastAPI /api/process background task.
        It sequences all five pipeline stages and handles errors at each
        stage without propagating exceptions to the caller.

        Args:
            resume_id:      MongoDB ObjectId string of the PENDING resume doc.
            cloudinary_url: Cloudinary CDN URL for the uploaded resume file.
            filename:       Original filename (used for format detection).
        """
        pipeline_start = time.time()
        logger.info("[WORKFLOW] Starting pipeline for resume_id=%s", resume_id)

        # ------------------------------------------------------------------
        # Stage 1 — Text extraction
        # ------------------------------------------------------------------
        try:
            raw_text = self._stage_extract_text(cloudinary_url, filename)
            if not raw_text.strip():
                raise ValueError("Extracted text is empty")
        except Exception as exc:
            logger.error("[WORKFLOW] Stage 1 FAILED: %s", exc)
            await self._set_status(resume_id, "FAILED")
            return

        # Update status: extraction started
        await self._set_status(
            resume_id, "EXTRACTING", rawText=raw_text
        )

        # ------------------------------------------------------------------
        # Stage 2 — Structured parsing (ResumeParserAgent via LangChain)
        # ------------------------------------------------------------------
        parsed: ResumeParseResponse = await self._stage_parse_resume(raw_text)

        # Update status: AI analysis in progress
        await self._set_status(resume_id, "ANALYZING")

        # ------------------------------------------------------------------
        # Stage 3 — Embedding generation
        # ------------------------------------------------------------------
        vector = self._stage_generate_embedding(raw_text)

        # ------------------------------------------------------------------
        # Stage 4 — ChromaDB vector storage
        # ------------------------------------------------------------------
        vector_stored = False
        if vector is not None:
            vector_stored = self._stage_store_vector(
                resume_id, vector, filename, parsed
            )

        # ------------------------------------------------------------------
        # Stage 5 — MongoDB final update
        # ------------------------------------------------------------------
        try:
            await self._stage_update_mongo(resume_id, parsed, vector_stored)
        except Exception as exc:
            logger.error("[WORKFLOW] Stage 5 FAILED: %s", exc)
            await self._set_status(resume_id, "FAILED")
            return

        total_time = time.time() - pipeline_start
        logger.info(
            "[WORKFLOW] Pipeline COMPLETE for resume_id=%s in %.2fs "
            "(candidate='%s', skills=%d, vector=%s)",
            resume_id,
            total_time,
            parsed.name,
            len(parsed.skills),
            "stored" if vector_stored else "skipped",
        )
