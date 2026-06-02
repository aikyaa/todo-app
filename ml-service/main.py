import logging
import os
from pathlib import Path

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

from fastapi import FastAPI, HTTPException
from queue_worker import start_queue_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI()

start_queue_worker()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/debug")
def debug():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail=f"OPENAI_API_KEY not set. Looked for .env at: {_env_path}")
    try:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, api_key=api_key)
        result = llm.invoke("Reply with the single word: OK")
        return {"api_key_loaded": True, "api_key_length": len(api_key), "llm_response": result.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM call failed: {e}")
