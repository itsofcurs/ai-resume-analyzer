import json
import logging
from typing import List, Optional, TypedDict

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import END, StateGraph
from services.llm.llm_router import LLMRouter

from utils.parser_utils import clean_json_str
from utils.retry_utils import ainvoke_with_retry

logger = logging.getLogger(__name__)


class AdaptiveInterviewState(TypedDict):
    resume_id: str
    organization_id: str
    current_topic: str
    conversation_history: List[dict]  # [{"question": "...", "answer": "..."}]

    last_answer_evaluation: Optional[dict]
    direction: Optional[str]  # "drill_down", "pivot_advanced", "explore_new"

    next_question: Optional[str]
    error: Optional[str]


EVALUATE_ANSWER_PROMPT = PromptTemplate.from_template(
    """Evaluate the candidate's last interview answer in the context of the conversation.
    Topic: {current_topic}
    Last Question: {last_question}
    Candidate Answer: {last_answer}
    
    Score the answer from 0-100 based on technical accuracy, completeness, and clarity.
    Identify any missing concepts or weak points.
    
    Return ONLY valid JSON:
    {{
        "score": <number>,
        "feedback": "<brief feedback>",
        "missing_concepts": ["<concept1>", "<concept2>"]
    }}"""
)

GENERATE_QUESTION_PROMPT = PromptTemplate.from_template(
    """You are an expert technical interviewer conducting an adaptive interview.
    
    Topic: {current_topic}
    Conversation History: {history}
    Last Answer Score: {score}
    Missing Concepts: {missing_concepts}
    Adaptive Strategy: {direction}
    
    Instructions for strategy:
    - If "drill_down": The candidate struggled or missed concepts. Ask a follow-up question specifically targeting the 'Missing Concepts' to test their true understanding.
    - If "pivot_advanced": The candidate answered well. Push them with a more complex, edge-case, or architectural scenario related to the topic.
    - If "explore_new": Move to a new sub-topic within the domain.
    
    Generate the next question directly. Do not include any meta-text.
    
    Return ONLY valid JSON:
    {{
        "next_question": "<the actual question string>"
    }}"""
)


class AdaptiveInterviewWorkflow:
    def __init__(self):
        builder = StateGraph(AdaptiveInterviewState)

        builder.add_node("evaluate_answer", self._node_evaluate_answer)
        builder.add_node("determine_direction", self._node_determine_direction)
        builder.add_node("generate_question", self._node_generate_question)

        builder.set_entry_point("evaluate_answer")
        builder.add_conditional_edges(
            "evaluate_answer",
            lambda s: "determine_direction" if not s.get("error") else END,
            ["determine_direction", END],
        )
        builder.add_conditional_edges(
            "determine_direction",
            lambda s: "generate_question" if not s.get("error") else END,
            ["generate_question", END],
        )
        builder.add_edge("generate_question", END)

        self._graph = builder.compile()

    async def _node_evaluate_answer(
        self, state: AdaptiveInterviewState
    ) -> AdaptiveInterviewState:
        if state.get("error"):
            return state
        logger.info("[ADAPTIVE] Stage 1 - Evaluating Last Answer")
        try:
            history = state.get("conversation_history", [])
            if not history:
                # First question of the interview
                state["last_answer_evaluation"] = {
                    "score": 100,
                    "feedback": "Initial",
                    "missing_concepts": [],
                }
                return state

            last_qa = history[-1]
            last_question = last_qa.get("question", "")
            last_answer = last_qa.get("answer", "")

            if not last_answer:
                state["last_answer_evaluation"] = {
                    "score": 0,
                    "feedback": "No answer provided.",
                    "missing_concepts": ["Everything"],
                }
                return state

            llm = LLMRouter.get_llm("interview")
            chain = EVALUATE_ANSWER_PROMPT | llm | StrOutputParser()

            raw = await ainvoke_with_retry(
                chain,
                {
                    "current_topic": state["current_topic"],
                    "last_question": last_question,
                    "last_answer": last_answer,
                },
            )

            data = json.loads(clean_json_str(raw))
            state["last_answer_evaluation"] = {
                "score": data.get("score", 50),
                "feedback": data.get("feedback", ""),
                "missing_concepts": data.get("missing_concepts", []),
            }
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_determine_direction(
        self, state: AdaptiveInterviewState
    ) -> AdaptiveInterviewState:
        if state.get("error"):
            return state
        logger.info("[ADAPTIVE] Stage 2 - Determining Direction")

        eval_data = state.get("last_answer_evaluation", {})
        score = eval_data.get("score", 50)

        # Simple Rules Engine
        if score < 70:
            state["direction"] = "drill_down"
        elif score >= 85:
            state["direction"] = "pivot_advanced"
        else:
            state["direction"] = "explore_new"

        return state

    async def _node_generate_question(
        self, state: AdaptiveInterviewState
    ) -> AdaptiveInterviewState:
        if state.get("error"):
            return state
        logger.info("[ADAPTIVE] Stage 3 - Generating Next Question")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = GENERATE_QUESTION_PROMPT | llm | StrOutputParser()

            eval_data = state.get("last_answer_evaluation", {})
            history_str = json.dumps(state.get("conversation_history", []))

            raw = await ainvoke_with_retry(
                chain,
                {
                    "current_topic": state["current_topic"],
                    "history": history_str,
                    "score": eval_data.get("score", 50),
                    "missing_concepts": json.dumps(
                        eval_data.get("missing_concepts", [])
                    ),
                    "direction": state.get("direction", "explore_new"),
                },
            )

            data = json.loads(clean_json_str(raw))
            state["next_question"] = data.get(
                "next_question", "Could you elaborate on your experience?"
            )
        except Exception as e:
            state["error"] = str(e)
        return state

    async def run(
        self,
        current_topic: str,
        conversation_history: List[dict],
        resume_id: str = "test",
        organization_id: str = "org",
    ) -> dict:
        initial_state: AdaptiveInterviewState = {
            "resume_id": resume_id,
            "organization_id": organization_id,
            "current_topic": current_topic,
            "conversation_history": conversation_history,
            "last_answer_evaluation": None,
            "direction": None,
            "next_question": None,
            "error": None,
        }

        result = await self._graph.ainvoke(initial_state)

        if result.get("error"):
            return {"error": result["error"]}

        return {
            "next_question": result.get("next_question"),
            "evaluation": result.get("last_answer_evaluation"),
            "direction": result.get("direction"),
        }
