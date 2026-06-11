package com.todo.queue;

import com.azure.messaging.servicebus.ServiceBusReceivedMessage;
import com.azure.messaging.servicebus.ServiceBusReceiverClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.todo.service.TaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Slf4j
@Component
@RequiredArgsConstructor
public class DeadLetterProcessor {

    private final ServiceBusReceiverClient deadLetterReceiverClient;
    private final TaskService              taskService;
    private final ObjectMapper             objectMapper;

    /**
     * Polls the dead-letter queue every 30 s.
     * Messages land here once they exceed Service Bus's max delivery count
     * (default 10) — meaning the ML service could not process them after
     * repeated attempts.
     *
     * markFailed lives in TaskService so @Transactional goes through the
     * Spring proxy rather than being a same-class call (which would bypass it).
     */
    @Scheduled(fixedDelay = 30_000)
    public void processDlq() {
        int processed = 0;
        for (ServiceBusReceivedMessage msg :
                deadLetterReceiverClient.receiveMessages(20, Duration.ofSeconds(5))) {
            try {
                String taskId = objectMapper
                        .readTree(msg.getBody().toString())
                        .get("taskId").asText();

                taskService.markFailed(taskId);
                deadLetterReceiverClient.complete(msg);
                processed++;
                log.info("DLQ: task {} marked FAILED, message completed", taskId);
            } catch (Exception e) {
                log.error("DLQ: failed to process message — abandoning: {}", e.getMessage(), e);
                deadLetterReceiverClient.abandon(msg);
            }
        }
        if (processed > 0)
            log.info("DLQ sweep complete — {} message(s) processed", processed);
    }
}
