import json
import logging
import os
import threading
from pathlib import Path

import requests
from azure.servicebus import ServiceBusClient
from azure.servicebus._common.constants import ServiceBusReceiveMode
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

from task_agent import analyze_task

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI()


# ── Queue worker ───────────────────────────────────────────────────────────────

def _process_message(message_body: str):
    payload       = json.loads(message_body)
    task_id       = payload["taskId"]
    raw_input     = payload["rawInput"]
    java_url      = os.getenv("JAVA_BACKEND_URL", "http://localhost:8080")
    enrich_secret = os.getenv("ENRICH_SECRET", "local-enrich-secret")

    logger.info("Processing task %s", task_id)

    result = analyze_task(raw_input)

    # split into extracted and categorized to match Java EnrichRequest shape
    extracted   = {k: result[k] for k in ("task", "description", "deadline", "status")}
    categorized = {k: result[k] for k in ("category", "priority")}

    response = requests.put(
        f"{java_url}/api/tasks/{task_id}/enrich",
        json={"extracted": extracted, "categorized": categorized},
        headers={"X-Enrich-Secret": enrich_secret},
        timeout=10,
    )
    response.raise_for_status()
    logger.info("Task %s enriched successfully", task_id)


def _run_worker():
    connection_str = os.getenv("AZURE_SERVICEBUS_CONNECTION_STRING")
    queue_name     = os.getenv("AZURE_SERVICEBUS_QUEUE_NAME", "task-queue")

    if not connection_str:
        logger.error("AZURE_SERVICEBUS_CONNECTION_STRING not set — queue worker will not start")
        return

    logger.info("Queue worker starting on queue: %s", queue_name)

    with ServiceBusClient.from_connection_string(connection_str) as client:
        with client.get_queue_receiver(
            queue_name,
            receive_mode=ServiceBusReceiveMode.PEEK_LOCK,
        ) as receiver:
            while True:
                messages = receiver.receive_messages(max_message_count=1, max_wait_time=30)
                for message in messages:
                    try:
                        _process_message(str(message))
                        receiver.complete_message(message)
                    except Exception as e:
                        logger.error("Failed to process message: %s", e, exc_info=True)
                        receiver.abandon_message(message)


def _start_queue_worker():
    thread = threading.Thread(target=_run_worker, name="queue-worker", daemon=True)
    thread.start()
    logger.info("Queue worker thread started")


_start_queue_worker()


# ── HTTP endpoints ─────────────────────────────────────────────────────────────

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
        llm    = ChatOpenAI(model="gpt-4o-mini", temperature=0, api_key=api_key)
        result = llm.invoke("Reply with the single word: OK")
        return {"api_key_loaded": True, "api_key_length": len(api_key), "llm_response": result.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM call failed: {e}")
