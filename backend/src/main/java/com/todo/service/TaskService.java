package com.todo.service;

import com.todo.dto.*;
import com.todo.model.Task;
import com.todo.queue.TaskQueueService;
import com.todo.repository.TaskRepository;
import com.todo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    private final TaskRepository taskRepository;
    private final TaskQueueService queueService;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public TaskResponse create(String rawInput, String userId) {
        Task task = Task.builder()
                .title(quickTitle(rawInput))
                .rawInput(rawInput)
                .userId(userId)
                .build();
        task = taskRepository.save(task);
        queueService.enqueue(new QueuedTaskPayload(task.getId(), rawInput));
        return TaskResponse.from(task);
    }

    // Extract first sentence or first 60 chars as a quick title — no LLM needed
    private String quickTitle(String rawInput) {
        String first = rawInput.split("[.!?,]")[0].trim();
        return first.length() > 60 ? first.substring(0, 60) + "…" : first;
    }

    public List<TaskResponse> getAll(String userId) {
        return taskRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream().map(TaskResponse::from).collect(Collectors.toList());
    }

    public List<TaskResponse> getByStatus(String status, String userId) {
        Task.Status s = Task.Status.valueOf(status.toUpperCase());
        return taskRepository.findByUserIdAndStatusOrderByCreatedAtDesc(userId, s)
                .stream().map(TaskResponse::from).collect(Collectors.toList());
    }

    public TaskResponse getOne(String id, String userId) {
        Task task = taskRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Task not found: " + id));
        if (!task.getUserId().equals(userId))
            throw new NoSuchElementException("Task not found: " + id); // don't expose that it exists
        return TaskResponse.from(task);
    }

    // Partial update — only non-null fields are applied
    @Transactional
    public TaskResponse update(String id, TaskUpdateRequest req, String userId) {
        Task task = taskRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Task not found: " + id));
        if (!task.getUserId().equals(userId))
            throw new NoSuchElementException("Task not found: " + id);

        if (req.getTitle() != null)       task.setTitle(req.getTitle());
        if (req.getDescription() != null) task.setDescription(req.getDescription());
        if (req.getStatus() != null)      task.setStatus(Task.Status.valueOf(req.getStatus()));
        if (req.getCategory() != null)    task.setCategory(req.getCategory());
        if (req.getPriority() != null)    task.setPriority(Task.Priority.valueOf(req.getPriority()));
        if (req.getDeadline() != null && !req.getDeadline().isBlank())
            task.setDeadline(LocalDateTime.parse(req.getDeadline()));

        return TaskResponse.from(taskRepository.save(task));
    }

    @Transactional
    public void delete(String id, String userId) {
        Task task = taskRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Task not found: " + id));
        if (!task.getUserId().equals(userId))
            throw new NoSuchElementException("Task not found: " + id);
        taskRepository.deleteById(id);
    }

    // Called by queue worker after ML pipeline completes — replaces "Processing…" with enriched values
    @Transactional
    public void enrich(String taskId, EnrichRequest req) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("Task not found: " + taskId));

        if (req.getTask() != null)        task.setTitle(req.getTask());
        if (req.getDescription() != null) task.setDescription(req.getDescription());

        // LLM may return full datetime or date-only — try both
        if (req.getDeadline() != null && !req.getDeadline().isBlank()) {
            try {
                task.setDeadline(LocalDateTime.parse(req.getDeadline()));
            } catch (Exception e1) {
                try {
                    task.setDeadline(LocalDate.parse(req.getDeadline()).atTime(23, 59, 59));
                } catch (Exception ignored) {
                    log.warn("Could not parse deadline '{}' for task {}", req.getDeadline(), taskId);
                }
            }
        }

        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            try { task.setStatus(Task.Status.valueOf(req.getStatus().toUpperCase())); } catch (Exception ignored) {}
        }

        if (req.getCategory() != null)
            task.setCategory(req.getCategory());
        if (req.getPriority() != null) {
            try { task.setPriority(Task.Priority.valueOf(req.getPriority().toUpperCase())); }
            catch (Exception ignored) {}
        }

        task.setEnriched(true);
        taskRepository.save(task);
        log.info("Task {} enriched: title='{}' status={} category={} priority={}",
                taskId, task.getTitle(), task.getStatus(), task.getCategory(), task.getPriority());

        // Push enriched task to the user's WebSocket session
        userRepository.findById(task.getUserId()).ifPresent(user -> {
            log.info("Pushing WebSocket update to user: {}", user.getEmail());
            messagingTemplate.convertAndSendToUser(
                    user.getEmail(),
                    "/queue/tasks",
                    TaskResponse.from(task)
            );
        });
    }
}
