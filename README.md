# TodoAI

A full-stack todo app where you describe tasks in plain English and AI automatically extracts the title, description, deadline, category, and priority.

---

## What it does

1. You type something like *"finish the quarterly report by friday and send it to the team"*
2. The task is saved immediately with a "processing" badge
3. An AI pipeline runs in the background — extracts the deadline, infers priority from context, categorizes it
4. The enriched task updates live in your browser without a refresh

---

## Architecture

```
Check block-diagram.png

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Axios, STOMP/SockJS |
| Backend | Java 21, Spring Boot 3.2, Spring Security, Spring WebSocket |
| Auth | JWT (JJWT), BCrypt |
| ML Service | Python, FastAPI, LangChain, Azure OpenAI |
| Queue | Azure Service Bus |
| Database | PostgreSQL |
| Deployment | Azure Container Apps, Azure Container Registry |

---

## Local setup

### Prerequisites

- Java 21
- Maven
- Python 3.11+
- Node.js 20+
- PostgreSQL running on port 5432
- Azure Service Bus namespace and queue

### 1. Database

```sql
CREATE DATABASE tododb;
```

### 2. Backend

Create `backend/run.ps1` :

```powershell
cd backend
```

```powershell
$env:AZURE_SERVICEBUS_CONNECTION_STRING="<your-connection-string>"
$env:AZURE_SERVICEBUS_QUEUE_NAME="task-queue"
$env:ENRICH_SECRET="local-enrich-secret"
mvn spring-boot:run
```

Runs on `http://localhost:8080`.

### 3. ML Service

Create `ml-service/.env` :

```
OPENAI_API_KEY=<your-azure-openai-key>
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=<your-deployment-name>
AZURE_SERVICEBUS_CONNECTION_STRING=<your-connection-string>
AZURE_SERVICEBUS_QUEUE_NAME=task-queue
ENRICH_SECRET=local-enrich-secret
JAVA_BACKEND_URL=http://localhost:8080
```

```bash
cd ml-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm start
```

Runs on `http://localhost:3000`.

---

## Environment variables

### Backend

| Variable | Description | Default |
|---|---|---|
| `SPRING_DATASOURCE_URL` | PostgreSQL JDBC URL | `jdbc:postgresql://localhost:5432/tododb` |
| `DB_USERNAME` | Database username | `postgres` |
| `DB_PASSWORD` | Database password | `postgres` |
| `JWT_SECRET` | Secret key for signing JWTs (min 32 chars) | dev default |
| `AZURE_SERVICEBUS_CONNECTION_STRING` | Service Bus connection string | — |
| `AZURE_SERVICEBUS_QUEUE_NAME` | Queue name | `task-queue` |
| `ENRICH_SECRET` | Shared secret for ML service callback | `local-enrich-secret` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins | `http://localhost:3000` |

### ML Service

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_DEPLOYMENT` | Model deployment name |
| `AZURE_SERVICEBUS_CONNECTION_STRING` | Service Bus connection string |
| `AZURE_SERVICEBUS_QUEUE_NAME` | Queue name |
| `ENRICH_SECRET` | Must match backend's `ENRICH_SECRET` |
| `JAVA_BACKEND_URL` | Backend base URL |

### Frontend

| Variable | Description | Default |
|---|---|---|
| `REACT_APP_API_URL` | Backend base URL | `http://localhost:8080` |

---

## Demo

🌐 **App** — https://polite-plant-08ce7cd0f.7.azurestaticapps.net

🎥 **Demo video** — 

---

## Project structure

```
todo-app/
├── backend/                  # Spring Boot API
│   ├── src/main/java/com/todo/
│   │   ├── config/           # Security, CORS, WebSocket, Azure Service Bus config
│   │   ├── controller/       # AuthController, TaskController
│   │   ├── service/          # AuthService, TaskService
│   │   ├── security/         # JwtFilter, JwtService, UserDetailsServiceImpl
│   │   ├── model/            # Task, User entities
│   │   ├── dto/              # Request/response DTOs
│   │   ├── repository/       # TaskRepository, UserRepository
│   │   ├── queue/            # TaskQueueService
│   │   └── exception/        # GlobalExceptionHandler
│   └── src/main/resources/
│       └── application.yml
├── ml-service/               # Python FastAPI + LangChain
│   ├── main.py               # FastAPI app, queue worker thread
│   └── task_agent.py         # LLM prompt, TaskAnalysis schema
└── frontend/                 # React app
    └── src/
        ├── App.js            # Main component, WebSocket setup
        └── services/api.js   # Axios clients

```

---

## How task enrichment works

```
User submits raw input
    → Backend saves skeleton task (enriched=false), returns immediately
    → TaskQueueService sends {taskId, rawInput} to Azure Service Bus
    → Frontend shows "processing" badge

Queue worker picks up message (PEEK_LOCK)
    → task_agent.py sends single prompt to Azure OpenAI
    → LLM returns structured TaskAnalysis (title, description, deadline, status, priority, category)
    → ML service calls PUT /api/tasks/{id}/enrich with result
    → Backend updates task fields, sets enriched=true
    → WebSocket push to user's browser session
    → Frontend patches task in-place — card updates live

Message acknowledged → deleted from queue
If processing fails → message abandoned → retried up to 10 times → dead-letter queue
```

---

## Edge case handling

### Stuck tasks — retry scheduler
If the ML service is down (or a message is silently lost), a task can sit in PENDING indefinitely. `TaskRetryScheduler` runs every 2 minutes and finds tasks that are `enriched = false`, `inQueue = false`, `status = PENDING`, and haven't been updated in 5+ minutes. It sets `inQueue = true`, resets `updatedAt` (which becomes the new retry clock), and re-sends the message to the queue.

### Dead-letter queue — `DeadLetterProcessor`
Service Bus moves a message to the dead-letter queue (DLQ) after 10 failed delivery attempts. `DeadLetterProcessor` polls the DLQ every 30 seconds, reads the `taskId` from each message, and calls `TaskService.markFailed()` to set the task to `FAILED` and push a WebSocket update to the user. The `markFailed` method lives in `TaskService` (not `DeadLetterProcessor`) so that `@Transactional` goes through the Spring proxy correctly.

### Queue unavailable at task creation
If `TaskQueueService.enqueue()` throws (Service Bus is down, queue is full, etc.), the `create()` method catches the exception and immediately marks the task `FAILED` so the user gets a visible error card rather than a task stuck on "processing" forever.

### Concurrent status overwrite protection
The ML pipeline may finish enrichment after the user has already manually updated a task's status. The `enrich()` method only applies the ML-returned status when the current status is still `PENDING` — it won't overwrite `IN_PROGRESS` or `COMPLETED` with whatever the LLM guessed.

### WebSocket infinite reconnect on expired JWT
The STOMP client's `beforeConnect` callback decodes the JWT expiry from the token payload (base64, no verification needed client-side) before each reconnect attempt. If the token is expired or missing, `client.deactivate()` is called immediately and the user is redirected to the login screen — preventing an infinite loop of 401-rejected connections.

---

## Design notes

### WebSocket vs SSE
This app uses WebSocket (STOMP over SockJS) for server-to-client task updates. In practice, all real-time communication flows in one direction only — the server pushes enriched task data to the browser; the browser never sends data over the socket. **Server-Sent Events (SSE)** would be a simpler and more appropriate fit for this pattern: SSE is a native browser API, requires no extra protocol layer, handles reconnection automatically, and works over plain HTTP/2 without the overhead of a WebSocket upgrade. The main trade-off is that SSE is strictly unidirectional, but since the frontend already uses REST for all writes, that's not a constraint here.
