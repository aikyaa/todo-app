package com.todo.queue;

import com.azure.messaging.servicebus.ServiceBusMessage;
import com.azure.messaging.servicebus.ServiceBusSenderClient;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.todo.dto.QueuedTaskPayload;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskQueueService {

    private final ServiceBusSenderClient senderClient;
    private final ObjectMapper objectMapper; // Spring Boot auto-configures this Jackson bean

    // Serialize the payload to JSON and send it as a Service Bus message
    public void enqueue(QueuedTaskPayload payload) {
        try {
            String json = objectMapper.writeValueAsString(payload);
            senderClient.sendMessage(new ServiceBusMessage(json));
            log.info("Queued task {} to Azure Service Bus", payload.getTaskId());
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize task payload: " + e.getMessage(), e);
        }
    }
}

