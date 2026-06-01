"""
FastAPI ML microservice
  POST /extract    — LangChain NLP extraction of task fields
  POST /categorize — LangGraph auto-category + priority recommendation
  GET  /debug      — sanity-check: confirms API key is loaded and LLM is reachable
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env explicitly from this file's directory
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents.extraction_agent     import extract_task_details
from agents.categorization_agent import categorize_task

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TodoAI ML Service",
    description="LangChain + LangGraph powered task intelligence",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ────────────────────────────────────────────────────────────────

class ExtractRequest(BaseModel):
    raw_input: str

class ExtractResponse(BaseModel):
    task:          str
    description:   str | None = None
    deadline:      str | None = None
    status:        str | None = None
    priority_hint: str | None = None

class CategorizeRequest(BaseModel):
    task:          str
    description:   str = ""
    deadline:      str = ""
    priority_hint: str | None = None

class CategorizeResponse(BaseModel):
    category: str
    priority: str


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/debug")
def debug():
    """Quick sanity-check: is the API key loaded? Can we reach Groq?"""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail=f"GROQ_API_KEY not set. Looked for .env at: {_env_path}"
        )

    # Light test: call the LLM with a trivial prompt
    try:
        from langchain_groq import ChatGroq
        llm    = ChatGroq(model="llama-3.1-8b-instant", temperature=0, api_key=api_key)
        result = llm.invoke("Reply with the single word: OK")
        return {
            "api_key_loaded": True,
            "api_key_length": len(api_key),
            "llm_response":   result.content,
            "env_path":       str(_env_path),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM call failed: {e}")


@app.post("/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest):
    if not req.raw_input.strip():
        raise HTTPException(status_code=400, detail="raw_input must not be empty")
    logger.info("Extracting: %.80s", req.raw_input)
    try:
        result = extract_task_details(req.raw_input)
    except Exception as e:
        logger.error("Extraction failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")
    return ExtractResponse(
        task=result.get("task") or req.raw_input[:100],
        description=result.get("description"),
        deadline=result.get("deadline"),
        status=result.get("status"),
        priority_hint=result.get("priority_hint"),
    )


@app.post("/categorize", response_model=CategorizeResponse)
def categorize(req: CategorizeRequest):
    if not req.task.strip():
        raise HTTPException(status_code=400, detail="task must not be empty")
    logger.info("Categorizing: %.80s | priority_hint=%s", req.task, req.priority_hint)
    try:
        result = categorize_task(req.task, req.description, req.deadline, req.priority_hint)
    except Exception as e:
        logger.error("Categorization failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Categorization failed: {e}")
    return CategorizeResponse(
        category=result.get("category", "OTHER"),
        priority=result.get("priority", "MEDIUM"),
    )
