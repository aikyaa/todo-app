package com.todo.queue;

import com.azure.messaging.servicebus.ServiceBusReceivedMessage;
import com.azure.messaging.servicebus.ServiceBusReceiverClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.todo.dto.TaskResponse;
import com.todo.model.Task;
import com.todo.repository.TaskRepository;
import com.todo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;

@Slf4j
@Component
@RequiredArgsConstructor
public class DeadLetterProcessor {

    private final ServiceBusReceiverClient deadLetterReceiverClient;
    private final TaskRepository           taskRepository;
    private final UserRepository           userRepository;
    private final SimpMessagingTemplate    messagingTemplate;
    private final ObjectMapper             objectMapper;

    /**
     * Polls the dead-letter queue every 30 s.
     * Messages land there once they exceed Service Bus's max delivery count
     * (default 10), meaning the ML service could not process them after
     * repeated attempts. We mark the corresponding task FAILED and notify
     * the user over WebSocket so the UI updates immediately.
     */
    @Scheduled(fixedDelay = 30_000)
    public void processDlq() {
        int processed = 0;
        // 5-second max wait so the scheduler thread is never blocked for long
        for (ServiceBusReceivedMessage msg :
                deadLetterReceiverClient.receiveMessages(20, Duration.ofSeconds(5))) {
            try {
                String body    = msg.getBody().toString();
                JsonNode json  = objectMapper.readTree(body);
                String taskId  = json.get("taskId").asText();

                markTaskFailed(taskId);
                deadLetterReceiverClient.complete(msg);
                processed++;
                log.info("DLQ: task {} marked FAILED and message completed", taskId);
            } catch (Exception e) {
                log.error("DLQ: failed to process message — abandoning: {}", e.getMessage(), e);
                deadLetterReceiverClient.abandon(msg);
            }
        }
        if (processed > 0) {
            log.info("DLQ sweep complete — processed {} message(s)", processed);
        }
    }

    @Transactional
    protected void markTaskFailed(String taskId) {
        taskRepository.findById(taskId).ifPresentOrElse(task -> {
            task.setStatus(Task.Status.FAILED);
            taskRepository.save(task);

            // Push status update to owner via WebSocket
            userRepository.findById(task.getUserId()).ifPresent(user -> {
                log.info("Pushing FAILED update to user: {}", user.getEmail());
                messagingTemplate.convertAndSendToUser(
                        user.getEmail(),
                        "/queue/tasks",
                        TaskResponse.from(task)
                );
            });
        }, () -> log.warn("DLQ: task {} not found in DB — skipping", taskId));
    }
}
