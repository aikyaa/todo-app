"""
LangChain extraction agent.
Uses structured output (OpenAI function calling) for reliable field extraction.
"""

import os
import logging
from datetime import date
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv

# Load .env from the ml-service directory regardless of where uvicorn was launched
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ExtractedTask(BaseModel):
    task: str = Field(description="Short task title, max 8 words")

    description: Optional[str] = Field(
        None,
        description="One sentence detail about the task"
    )

    deadline: Optional[str] = Field(
        None,
        description=(
            "Deadline as ISO-8601 datetime: YYYY-MM-DDTHH:mm:ss. "
            "Resolve relative terms (tomorrow, next Friday, in 3 days, next week) "
            "using today's date given in the system prompt. "
            "If a time is not stated, use T23:59:59. "
            "Return null ONLY if no deadline is mentioned at all."
        )
    )

    status: Optional[Literal["PENDING", "IN_PROGRESS", "COMPLETED"]] = Field(
        None,
        description=(
            "Task status. Use IN_PROGRESS for phrases like 'working on', 'currently doing', "
            "'started', 'in progress'. Use COMPLETED for 'done', 'finished', 'completed'. "
            "Default to PENDING if unclear."
        )
    )

    priority_hint: Optional[Literal["LOW", "MEDIUM", "HIGH", "URGENT"]] = Field(
        None,
        description=(
            "Set ONLY if the user explicitly states a priority level. "
            "Examples: 'urgent', 'asap', 'critical' → URGENT; "
            "'high priority', 'important' → HIGH; "
            "'low priority', 'whenever' → LOW. "
            "Leave null if priority is not explicitly mentioned."
        )
    )


_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are a task extraction assistant. Today is {today}. "
     "Extract structured task information from the user's natural language input. "
     "When resolving relative dates, count from today's date above."),
    ("human", "{raw_input}"),
])


def _get_llm():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise EnvironmentError(
            f"GROQ_API_KEY is not set. Looked for .env at: {_env_path}"
        )
    logger.info("GROQ_API_KEY loaded (length=%d)", len(api_key))
    return ChatGroq(model="llama-3.1-8b-instant", temperature=0, api_key=api_key)


def extract_task_details(raw_input: str) -> dict:
    """
    Raises on failure — callers should let exceptions bubble up to FastAPI
    so errors are visible rather than silently swallowed.
    """
    llm   = _get_llm().with_structured_output(ExtractedTask)
    chain = _PROMPT | llm
    result: ExtractedTask = chain.invoke({
        "raw_input": raw_input,
        "today":     date.today().isoformat(),
    })
    logger.info(
        "Extracted — task=%r status=%s deadline=%s priority_hint=%s",
        result.task, result.status, result.deadline, result.priority_hint
    )
    return {
        "task":          result.task,
        "description":   result.description,
        "deadline":      result.deadline,
        "status":        result.status,
        "priority_hint": result.priority_hint,
    }
