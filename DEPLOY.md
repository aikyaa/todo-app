# Azure Deployment Guide

## Prerequisites
- Azure CLI installed: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli
- Docker Desktop running
- Azure subscription

---

## 1. Login and set variables

```bash
az login

# Choose names — ACR name must be globally unique, lowercase, no hyphens
RESOURCE_GROUP=todo-app-rg
LOCATION=eastus
ACR_NAME=todoappcr123          # change this to something unique
POSTGRES_SERVER=todo-pg-123    # change this to something unique
POSTGRES_DB=tododb
POSTGRES_USER=todoadmin
POSTGRES_PASSWORD=YourStr0ngPassword!   # use a strong password
CONTAINER_ENV=todo-env
```

---

## 2. Create Resource Group

```bash
az group create --name $RESOURCE_GROUP --location $LOCATION
```

---

## 3. Create Azure Container Registry

```bash
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

# Get credentials for later
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)
```

---

## 4. Create PostgreSQL Database

```bash
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $POSTGRES_SERVER \
  --location $LOCATION \
  --admin-user $POSTGRES_USER \
  --admin-password $POSTGRES_PASSWORD \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --yes

# Create the database
az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name $POSTGRES_SERVER \
  --database-name $POSTGRES_DB

# Allow Azure services to connect to the database
az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name $POSTGRES_SERVER \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

---

## 5. Build and push Docker images

```bash
az acr login --name $ACR_NAME

# Backend
docker build -t $ACR_LOGIN_SERVER/todo-backend:latest ./backend
docker push $ACR_LOGIN_SERVER/todo-backend:latest

# ML service
docker build -t $ACR_LOGIN_SERVER/todo-ml:latest ./ml-service
docker push $ACR_LOGIN_SERVER/todo-ml:latest

# Frontend — placeholder build (we'll rebuild after we know the backend URL)
docker build -t $ACR_LOGIN_SERVER/todo-frontend:latest ./frontend
docker push $ACR_LOGIN_SERVER/todo-frontend:latest
```

---

## 6. Create Container Apps environment

```bash
az containerapp env create \
  --name $CONTAINER_ENV \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

---

## 7. Deploy backend

Replace the placeholder values in angle brackets with your real secrets.

```bash
POSTGRES_URL="jdbc:postgresql://$POSTGRES_SERVER.postgres.database.azure.com:5432/$POSTGRES_DB?sslmode=require"

az containerapp create \
  --name todo-backend \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_ENV \
  --image $ACR_LOGIN_SERVER/todo-backend:latest \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 8080 \
  --ingress external \
  --min-replicas 1 \
  --env-vars \
    SPRING_DATASOURCE_URL="$POSTGRES_URL" \
    DB_USERNAME="$POSTGRES_USER" \
    DB_PASSWORD="$POSTGRES_PASSWORD" \
    JWT_SECRET="<generate-a-long-random-string>" \
    AZURE_SERVICEBUS_CONNECTION_STRING="<your-service-bus-connection-string>" \
    AZURE_SERVICEBUS_QUEUE_NAME="task-queue" \
    ENRICH_SECRET="<pick-a-shared-secret>"

# Get the backend URL
BACKEND_URL=$(az containerapp show \
  --name todo-backend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn -o tsv)

echo "Backend URL: https://$BACKEND_URL"
```

---

## 8. Deploy ML service

```bash
az containerapp create \
  --name todo-ml \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_ENV \
  --image $ACR_LOGIN_SERVER/todo-ml:latest \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 8000 \
  --ingress internal \
  --min-replicas 1 \
  --env-vars \
    OPENAI_API_KEY="<your-azure-openai-key>" \
    AZURE_OPENAI_ENDPOINT="https://todo-app.openai.azure.com/" \
    AZURE_OPENAI_DEPLOYMENT="gpt-5.4-mini" \
    AZURE_SERVICEBUS_CONNECTION_STRING="<your-service-bus-connection-string>" \
    AZURE_SERVICEBUS_QUEUE_NAME="task-queue" \
    ENRICH_SECRET="<same-shared-secret-as-backend>" \
    JAVA_BACKEND_URL="https://$BACKEND_URL"
```

Note: `--ingress internal` means the ML service is not publicly reachable — only other services in the same environment can call it. The ML service doesn't need to be public since it calls the backend (not the other way around).

---

## 9. Deploy frontend

Now that you have the backend URL, rebuild the frontend image with it baked in.

```bash
docker build \
  --build-arg REACT_APP_API_URL="https://$BACKEND_URL" \
  -t $ACR_LOGIN_SERVER/todo-frontend:latest \
  ./frontend

docker push $ACR_LOGIN_SERVER/todo-frontend:latest

az containerapp create \
  --name todo-frontend \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_ENV \
  --image $ACR_LOGIN_SERVER/todo-frontend:latest \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 80 \
  --ingress external \
  --min-replicas 1

# Get the frontend URL
FRONTEND_URL=$(az containerapp show \
  --name todo-frontend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn -o tsv)

echo "Frontend URL: https://$FRONTEND_URL"
```

---

## 10. Update backend CORS with the frontend URL

The backend needs to allow requests from the actual frontend URL.

```bash
az containerapp update \
  --name todo-backend \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars CORS_ALLOWED_ORIGINS="https://$FRONTEND_URL"
```

---

## 11. Verify

- Open `https://$FRONTEND_URL` in your browser
- Register an account and create a task
- Check backend logs: `az containerapp logs show --name todo-backend --resource-group $RESOURCE_GROUP --follow`
- Check ML service logs: `az containerapp logs show --name todo-ml --resource-group $RESOURCE_GROUP --follow`

---

## Re-deploying after code changes

```bash
# Rebuild and push the changed image
docker build -t $ACR_LOGIN_SERVER/todo-backend:latest ./backend
docker push $ACR_LOGIN_SERVER/todo-backend:latest

# Tell Container Apps to pull the new image
az containerapp update --name todo-backend --resource-group $RESOURCE_GROUP \
  --image $ACR_LOGIN_SERVER/todo-backend:latest
```

---

## Tear down everything

```bash
az group delete --name $RESOURCE_GROUP --yes
```
This deletes all resources in the group — database, registry, container apps, everything.
