"""
workflows/outreach_workflow.py
------------------------------
AI Outreach Generator.
Generates personalized emails using Candidate Data, JD, and Notes.
"""

import json
import logging
from typing import Optional, TypedDict

from bson import ObjectId
from database import get_mongo_collection
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import END, StateGraph
from services.llm.llm_router import LLMRouter

from utils.parser_utils import clean_json_str

logger = logging.getLogger(__name__)


class OutreachState(TypedDict):
    candidate_id: str
    organization_id: str
    job_id: Optional[str]
    outreach_type: str
    notes: Optional[str]
    candidate_data: Optional[dict]
    job_description: Optional[str]
    generated_content: Optional[dict]
    error: Optional[str]


class OutreachWorkflow:
    def __init__(self):
        graph = StateGraph(OutreachState)

        graph.add_node("fetch_context", self._node_fetch_context)
        graph.add_node("generate_content", self._node_generate_content)
        graph.add_node("handle_failure", self._node_handle_failure)

        graph.set_entry_point("fetch_context")

        graph.add_conditional_edges(
            "fetch_context",
            lambda s: "handle_failure" if s.get("error") else "generate_content",
        )
        graph.add_conditional_edges(
            "generate_content", lambda s: "handle_failure" if s.get("error") else END
        )
        graph.add_edge("handle_failure", END)

        self._graph = graph.compile()

    async def _node_fetch_context(self, state: OutreachState) -> OutreachState:
        try:
            # 1. Fetch Candidate
            collection = get_mongo_collection()
            doc = await collection.find_one(
                {
                    "_id": ObjectId(state["candidate_id"]),
                    "organizationId": state["organization_id"],
                }
            )
            if not doc:
                state["error"] = "Candidate not found"
                return state

            state["candidate_data"] = {
                "name": doc.get("candidateName", "Candidate"),
                "data": doc.get("parsedData", {}),
                "strengths": doc.get("skillGraph", {}).get("strengths", []),
                "cluster": doc.get("knowledgeGraph", {}).get(
                    "candidateCluster", "Unknown"
                ),
            }

            # 2. Fetch JD
            if state.get("job_id"):
                from database import get_prisma_client

                prisma = await get_prisma_client()
                job = await prisma.jobdescription.find_unique(
                    where={
                        "id": state["job_id"],
                        "organizationId": state["organization_id"],
                    }
                )
                if job:
                    state["job_description"] = job.title + "\n" + job.description
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_generate_content(self, state: OutreachState) -> OutreachState:
        try:
            llm = LLMRouter.get_llm("copilot")
            prompt = PromptTemplate.from_template(
                """You are an expert AI Technical Recruiter.
                Write a highly personalized outreach message for the candidate based on the provided context.
                
                Outreach Type: {outreach_type} (e.g., initial_contact, follow_up, rejection, offer)
                Additional Notes from Recruiter: {notes}
                
                Candidate Name: {name}
                Candidate Strengths/Profile: {strengths}
                
                Job Context (if any):
                {jd}
                
                Generate a Subject Line and the Body of the email. Keep it professional, engaging, and concise.
                
                Return ONLY valid JSON:
                {{
                    "subject": "string",
                    "body": "string"
                }}"""
            )

            chain = prompt | llm | StrOutputParser()
            res = await chain.ainvoke(
                {
                    "outreach_type": state["outreach_type"],
                    "notes": state.get("notes", "None"),
                    "name": state["candidate_data"]["name"],
                    "strengths": json.dumps(state["candidate_data"]["strengths"]),
                    "jd": state.get("job_description", "No specific job attached."),
                }
            )
            parsed = json.loads(clean_json_str(res))
            state["generated_content"] = parsed
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_handle_failure(self, state: OutreachState) -> OutreachState:
        logger.error(f"[OUTREACH] Failed: {state.get('error')}")
        return state

    async def run(
        self,
        candidate_id: str,
        organization_id: str,
        job_id: str = None,
        outreach_type: str = "initial_contact",
        notes: str = None,
    ) -> dict:
        state = {
            "candidate_id": candidate_id,
            "organization_id": organization_id,
            "job_id": job_id,
            "outreach_type": outreach_type,
            "notes": notes,
            "candidate_data": None,
            "job_description": None,
            "generated_content": None,
            "error": None,
        }
        final_state = await self._graph.ainvoke(state)
        if final_state.get("error"):
            return {"error": final_state["error"]}
        return final_state["generated_content"]
