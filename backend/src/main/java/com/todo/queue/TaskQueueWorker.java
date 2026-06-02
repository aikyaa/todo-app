package com.todo.queue;

import com.azure.messaging.servicebus.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.todo.dto.QueuedTaskPayload;
import com.todo.service.MLService;
import com.todo.service.TaskService;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class TaskQueueWorker {

    private final MLService mlService;//calling the instance created by spring, no new
    private final TaskService taskService;
    private final ObjectMapper objectMapper;

    @Value("${azure.servicebus.connection-string}")
    private String connectionString;

    @Value("${azure.servicebus.queue-name}")
    private String queueName;

    private ServiceBusProcessorClient processorClient;

    //daemon(background) thread is started after injecting dependencies required
    @PostConstruct
    public void start() {
        processorClient = new ServiceBusClientBuilder()
                .connectionString(connectionString)
                .processor()
                .queueName(queueName)
                .processMessage(this::processMessage)    // called for each message
                .processError(this::processError)        // called on connection/processing errors
                .buildProcessorClient();

        processorClient.start();
        log.info("Azure Service Bus processor started on queue: {}", queueName);
    }

    // Called by the SDK for each message received from the queue
    // The SDK handles message locking — if this throws, the message becomes available again for retry
    private void processMessage(ServiceBusReceivedMessageContext context) {
        ServiceBusReceivedMessage message = context.getMessage();
        try {
            // Deserialize the JSON message body back into a QueuedTaskPayload
            QueuedTaskPayload payload = objectMapper.readValue(message.getBody().toString(), QueuedTaskPayload.class);
            log.info("Processing task {}", payload.getTaskId());

            Map<String, Object> extracted   = mlService.extract(payload.getRawInput());
            Map<String, Object> categorized = mlService.categorize(
                    (String) extracted.getOrDefault("task",          ""),
                    (String) extracted.getOrDefault("description",   ""),
                    (String) extracted.getOrDefault("deadline",      ""),
                    (String) extracted.getOrDefault("priority_hint", null));

            taskService.enrich(payload.getTaskId(), extracted, categorized);

            // Explicitly complete the message — removes it from the queue permanently
            // If we don't complete it, the lock expires and it becomes available again
            context.complete();

        } catch (Exception e) {
            log.error("Failed to process message {}: {}", message.getMessageId(), e.getMessage());
            // Abandon the message — releases the lock, message becomes available for retry
            // After max delivery count (default 10) it moves to the dead letter queue
            context.abandon();
        }
    }

    private void processError(ServiceBusErrorContext context) {
        log.error("Service Bus error on {}: {}", context.getEntityPath(), context.getException().getMessage());
    }

    // Gracefully shut down the processor when the app stops
    @PreDestroy
    public void stop() {
        if (processorClient != null) {
            processorClient.close();
            log.info("Azure Service Bus processor stopped");
        }
    }
}

