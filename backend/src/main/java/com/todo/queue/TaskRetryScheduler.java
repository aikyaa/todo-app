package com.todo.queue;

import com.todo.dto.QueuedTaskPayload;
import com.todo.model.Task;
import com.todo.repository.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class TaskRetryScheduler {

    private static final int STUCK_AFTER_MINUTES = 5;

    private final TaskRepository    taskRepository;
    private final TaskQueueService  queueService;

    /**
     * Every 2 minutes, find PENDING tasks that haven't been enriched and
     * haven't been updated in 5+ minutes — meaning they're stuck — and
     * re-queue them.
     *
     * updatedAt is used as the retry clock: when we re-queue we save the task,
     * which triggers @PreUpdate and resets updatedAt. So the same task won't
     * be retried again for another 5 minutes.
     */
    @Scheduled(fixedDelay = 120_000)
    @Transactional
    public void retryStuckTasks() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(STUCK_AFTER_MINUTES);

        List<Task> stuck = taskRepository
                .findByEnrichedFalseAndInQueueFalseAndStatusAndUpdatedAtBefore(Task.Status.PENDING, cutoff);

        if (stuck.isEmpty()) return;

        log.info("Retry scheduler: found {} stuck task(s), re-queuing", stuck.size());

        for (Task task : stuck) {
            try {
                task.setInQueue(true);
                task.setUpdatedAt(LocalDateTime.now());
                taskRepository.save(task);

                queueService.enqueue(new QueuedTaskPayload(task.getId(), task.getRawInput()));
                log.info("Re-queued stuck task {}", task.getId());
            } catch (Exception e) {
                log.error("Failed to re-queue task {}: {}", task.getId(), e.getMessage());
            }
        }
    }
}
