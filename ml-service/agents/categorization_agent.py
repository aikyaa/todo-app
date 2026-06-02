import os
import logging
from pathlib import Path
from typing import Literal, Optional, TypedDict

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class GraphState(TypedDict):
    task:          str
    description:   str
    deadline:      str
    priority_hint: Optional[str]
    category:      Optional[str]
    priority:      Optional[str]


class CategoryOut(BaseModel):
    category: Literal["WORK", "PERSONAL", "HEALTH", "FINANCE", "LEARNING", "OTHER"] = Field(
        description=(
            "Category of the task. Choose the single best fit: "
            "WORK = job, meetings, reports, code, emails, projects; "
            "PERSONAL = errands, family, home, hobbies, social; "
            "HEALTH = exercise, doctor, medicine, wellness, fitness; "
            "FINANCE = bills, budget, taxes, investments, payments; "
            "LEARNING = study, courses, reading, research, tutorials; "
            "OTHER = anything that does not fit the above."
        )
    )


class PriorityOut(BaseModel):
    priority: Literal["LOW", "MEDIUM", "HIGH", "URGENT"] = Field(
        description=(
            "Priority level based on urgency and deadline: "
            "URGENT = deadline is today or tomorrow, or user said urgent/asap/critical; "
            "HIGH = deadline within 3 days, or user said important/high priority; "
            "MEDIUM = deadline within a week, or normal importance; "
            "LOW = no deadline, or user said low priority/whenever."
        )
    )


_CAT_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are a task categorization assistant. "
     "Classify the task into exactly one category from the allowed values."),
    ("human", "Task: {task}\nDescription: {description}"),
])

_PRIO_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are a task priority advisor. "
     "Assign a priority level based on the task context, deadline, and any explicit priority hint. "
     "If a priority_hint is provided (not 'none'), always use it — it reflects what the user explicitly stated."),
    ("human",
     "Task: {task}\n"
     "Description: {description}\n"
     "Deadline: {deadline}\n"
     "Category: {category}\n"
     "Explicit priority hint from user: {priority_hint}"),
])


def _llm():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise EnvironmentError(
            f"OPENAI_API_KEY is not set. Looked for .env at: {_env_path}"
        )
    return ChatOpenAI(model="gpt-4o-mini", temperature=0, api_key=api_key)


def categorize_node(state: GraphState) -> dict:
    llm    = _llm().with_structured_output(CategoryOut)
    chain  = _CAT_PROMPT | llm
    result = chain.invoke({
        "task":        state["task"],
        "description": state.get("description") or "",
    })
    logger.info("Category: %s", result.category)
    return {"category": result.category}


def prioritize_node(state: GraphState) -> dict:
    hint = state.get("priority_hint")
    if hint and hint in ("LOW", "MEDIUM", "HIGH", "URGENT"):
        logger.info("Priority (from explicit hint): %s", hint)
        return {"priority": hint}

    llm    = _llm().with_structured_output(PriorityOut)
    chain  = _PRIO_PROMPT | llm
    result = chain.invoke({
        "task":          state["task"],
        "description":   state.get("description") or "",
        "deadline":      state.get("deadline") or "not specified",
        "category":      state.get("category") or "OTHER",
        "priority_hint": hint or "none",
    })
    logger.info("Priority: %s", result.priority)
    return {"priority": result.priority}


def _build_graph():
    g = StateGraph(GraphState)
    g.add_node("categorize", categorize_node)
    g.add_node("prioritize", prioritize_node)
    g.set_entry_point("categorize")
    g.add_edge("categorize", "prioritize")
    g.add_edge("prioritize", END)
    return g.compile()


_graph = _build_graph()


def categorize_task(task: str, description: str, deadline: str, priority_hint: str = None) -> dict:
    """Raises on failure — let it bubble up to FastAPI."""
    return _graph.invoke({
        "task":          task,
        "description":   description or "",
        "deadline":      deadline or "",
        "priority_hint": priority_hint,
        "category":      None,
        "priority":      None,
    })
