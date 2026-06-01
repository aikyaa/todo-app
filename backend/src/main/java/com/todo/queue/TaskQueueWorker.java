package com.todo.queue;

import com.todo.dto.QueuedTaskPayload;
import com.todo.service.MLService;
import com.todo.service.TaskService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class TaskQueueWorker {

    private final TaskQueueService queue;
    private final MLService mlService;
    private final TaskService taskService;

    // Start after dependencies are injected — constructor would run before injection
    @PostConstruct
    public void start() {
        Thread worker = new Thread(this::run, "task-queue-worker");
        worker.setDaemon(true); // JVM won't wait for this thread on shutdown
        worker.start();
        log.info("Task queue worker started");
    }

    private void run() {
        while (true) {
            try {
                QueuedTaskPayload payload = queue.take(); // blocks until a task arrives
                log.info("Processing task {}", payload.getTaskId());

                Map<String, Object> extracted   = mlService.extract(payload.getRawInput());
                Map<String, Object> categorized = mlService.categorize(
                        (String) extracted.getOrDefault("task",          ""),
                        (String) extracted.getOrDefault("description",   ""),
                        (String) extracted.getOrDefault("deadline",      ""),
                        (String) extracted.getOrDefault("priority_hint", null));

                taskService.enrich(payload.getTaskId(), extracted, categorized);

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt(); // restore interrupt flag
                break;
            } catch (Exception e) {
                log.error("Worker error: {}", e.getMessage()); // log and continue to next task
            }
        }
    }
}
