import os
import logging
from datetime import date
from pathlib import Path
from typing import Literal, Optional

from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient
from dotenv import load_dotenv
from langchain_openai import AzureChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

logger = logging.getLogger(__name__)


def _get_secret(secret_name: str, env_fallback: str) -> str:
    """Fetch a secret from Azure Key Vault when AZURE_KEYVAULT_URL is set,
    otherwise fall back to the given environment variable name.

    In production the Container App's managed identity is used automatically.
    Locally, DefaultAzureCredential picks up your `az login` session.
    """
    vault_url = os.getenv("AZURE_KEYVAULT_URL")
    if vault_url:
        logger.info("Fetching secret '%s' from Key Vault", secret_name)
        client = SecretClient(vault_url=vault_url, credential=DefaultAzureCredential())
        return client.get_secret(secret_name).value
    value = os.getenv(env_fallback, "")
    if value:
        logger.info("Key Vault not configured — using env var '%s'", env_fallback)
    return value


class TaskAnalysis(BaseModel):
    task: str = Field(description="Short task title, max 8 words")

    description: Optional[str] = Field(
        None,
        description="One sentence detail about the task. Write in direct task form — no references to 'the user', 'they', or 'you'. Example: 'Complete the quarterly report and send to the team' not 'The user wants to complete the quarterly report'."
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
            "Task status. Use IN_PROGRESS for 'working on', 'started', 'in progress'. "
            "Use COMPLETED for 'done', 'finished', 'completed'. "
            "Default to PENDING if unclear."
        )
    )

    priority: Optional[Literal["LOW", "MEDIUM", "HIGH", "URGENT"]] = Field(
        "MEDIUM",
        description=(
            "Priority level. If user explicitly states a priority use it directly. "
            "Otherwise infer from deadline and context: "
            "URGENT = deadline today or tomorrow, or 'asap'/'critical'; "
            "HIGH = deadline within 3 days, or 'important'; "
            "MEDIUM = deadline within a week, or normal importance; "
            "LOW = no deadline, or 'whenever'/'low priority'."
        )
    )

    category: Optional[Literal["WORK", "PERSONAL", "HEALTH", "FINANCE", "LEARNING", "OTHER"]] = Field(
        "OTHER",
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


_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are a task analysis assistant. Today is {today}. "
     "Extract and classify all task details from the user's natural language input in one pass. "
     "Resolve relative dates using today's date above."),
    ("human", "{raw_input}"),
])


def _build_llm():
    api_key  = _get_secret("openai-api-key", "OPENAI_API_KEY")
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "https://todo-app.openai.azure.com/")
    deploy   = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini")
    if not api_key:
        raise EnvironmentError(
            "OpenAI API key not found. Either set AZURE_KEYVAULT_URL (and run `az login` locally) "
            f"or set the OPENAI_API_KEY env var. Looked for .env at: {_env_path}"
        )
    return AzureChatOpenAI(
        azure_endpoint=endpoint,
        api_key=api_key,
        azure_deployment=deploy,
        api_version="2024-08-01-preview",
        temperature=0,
    ).with_structured_output(TaskAnalysis)

# Initialize once at module load — reused for every task
_llm = _build_llm()


def analyze_task(raw_input: str) -> dict:
    result = (_PROMPT | _llm).invoke({
        "raw_input": raw_input,
        "today":     date.today().isoformat(),
    })
    logger.info(
        "Analyzed — task=%r category=%s priority=%s deadline=%s",
        result.task, result.category, result.priority, result.deadline
    )
    return result.model_dump()
