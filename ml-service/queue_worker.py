"""
Azure Service Bus queue consumer.
Reads task payloads from the queue, runs the ML pipeline,
then calls the Java backend's /api/tasks/{id}/enrich endpoint.
"""

import json
import logging
import os
import threading

import requests
from azure.servicebus import ServiceBusClient
from azure.servicebus._common.constants import ServiceBusReceiveMode

from agents.extraction_agent import extract_task_details
from agents.categorization_agent import categorize_task

logger = logging.getLogger(__name__)


def _process_message(message_body: str):
    """Process a single task payload — extract, categorize, call Java enrich endpoint."""
    payload = json.loads(message_body)
    task_id   = payload["taskId"]
    raw_input = payload["rawInput"]

    logger.info("Processing task %s", task_id)

    extracted   = extract_task_details(raw_input)
    categorized = categorize_task(
        extracted.get("task", ""),
        extracted.get("description", ""),
        extracted.get("deadline", ""),
        extracted.get("priority_hint"),
    )

    # Call Java backend to write enriched fields to the database
    java_url     = os.getenv("JAVA_BACKEND_URL", "http://localhost:8080")
    enrich_secret = os.getenv("ENRICH_SECRET", "local-enrich-secret")

    response = requests.put(
        f"{java_url}/api/tasks/{task_id}/enrich",
        json={"extracted": extracted, "categorized": categorized},
        headers={"X-Enrich-Secret": enrich_secret},
        timeout=10,
    )
    response.raise_for_status()
    logger.info("Task %s enriched successfully", task_id)


def _run_worker():
    """Infinite loop — reads messages from Azure Service Bus and processes them one by one."""
    connection_str = os.getenv("AZURE_SERVICEBUS_CONNECTION_STRING")
    queue_name     = os.getenv("AZURE_SERVICEBUS_QUEUE_NAME", "task-queue")

    if not connection_str:
        logger.error("AZURE_SERVICEBUS_CONNECTION_STRING not set — queue worker will not start")
        return

    logger.info("Queue worker starting on queue: %s", queue_name)

    with ServiceBusClient.from_connection_string(connection_str) as client:
        with client.get_queue_receiver(
            queue_name,
            receive_mode=ServiceBusReceiveMode.PEEK_LOCK,  # lock message while processing
        ) as receiver:
            while True:
                # Block until a message arrives (max_wait_time=None = wait forever)
                messages = receiver.receive_messages(max_message_count=1, max_wait_time=30)
                for message in messages:
                    try:
                        _process_message(str(message))
                        receiver.complete_message(message)  # remove from queue permanently
                    except Exception as e:
                        logger.error("Failed to process message: %s", e, exc_info=True)
                        receiver.abandon_message(message)  # release lock — becomes available for retry


def start_queue_worker():
    """Start the queue worker in a background daemon thread."""
    thread = threading.Thread(target=_run_worker, name="queue-worker", daemon=True)
    thread.start()
    logger.info("Queue worker thread started")
