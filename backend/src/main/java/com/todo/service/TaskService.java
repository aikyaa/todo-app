package com.todo.service;

import com.todo.dto.*;
import com.todo.model.Task;
import com.todo.queue.TaskQueueService;
import com.todo.repository.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    private final TaskRepository taskRepository;
    private final TaskQueueService queueService;

    // Save skeleton task immediately, then enqueue for async AI enrichment
    @Transactional
    public TaskResponse create(String rawInput) {
        Task task = Task.builder()
                .title("Processing…")
                .rawInput(rawInput)
                .build();
        task = taskRepository.save(task);
        queueService.enqueue(new QueuedTaskPayload(task.getId(), rawInput));
        return TaskResponse.from(task);
    }

    public List<TaskResponse> getAll() {
        return taskRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(TaskResponse::from).collect(Collectors.toList());
    }

    public List<TaskResponse> getByStatus(String status) {
        Task.Status s = Task.Status.valueOf(status.toUpperCase());
        return taskRepository.findByStatusOrderByCreatedAtDesc(s)
                .stream().map(TaskResponse::from).collect(Collectors.toList());
    }

    public TaskResponse getOne(String id) {
        return taskRepository.findById(id)
                .map(TaskResponse::from)
                .orElseThrow(() -> new NoSuchElementException("Task not found: " + id));
    }

    // Partial update — only non-null fields are applied
    @Transactional
    public TaskResponse update(String id, TaskUpdateRequest req) {
        Task task = taskRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Task not found: " + id));

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
    public void delete(String id) {
        if (!taskRepository.existsById(id))
            throw new NoSuchElementException("Task not found: " + id);
        taskRepository.deleteById(id);
    }

    // Called by queue worker after ML pipeline completes — replaces "Processing…" with enriched values
    @Transactional
    public void enrich(String taskId, Map<String, Object> extracted, Map<String, Object> categorized) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("Task not found: " + taskId));

        if (extracted.get("task") != null)
            task.setTitle((String) extracted.get("task"));
        if (extracted.get("description") != null)
            task.setDescription((String) extracted.get("description"));

        // LLM may return full datetime or date-only — try both
        if (extracted.get("deadline") instanceof String d && !d.isBlank()) {
            try {
                task.setDeadline(LocalDateTime.parse(d));
            } catch (Exception e1) {
                try {
                    task.setDeadline(LocalDate.parse(d).atTime(23, 59, 59));
                } catch (Exception ignored) {
                    log.warn("Could not parse deadline '{}' for task {}", d, taskId);
                }
            }
        }

        if (extracted.get("status") instanceof String s && !s.isBlank()) {
            try { task.setStatus(Task.Status.valueOf(s.toUpperCase())); } catch (Exception ignored) {}
        }

        if (categorized.get("category") != null)
            task.setCategory((String) categorized.get("category"));
        if (categorized.get("priority") != null) {
            try { task.setPriority(Task.Priority.valueOf(((String) categorized.get("priority")).toUpperCase())); }
            catch (Exception ignored) {}
        }

        taskRepository.save(task);
        log.info("Task {} enriched: title='{}' status={} category={} priority={}",
                taskId, task.getTitle(), task.getStatus(), task.getCategory(), task.getPriority());
    }
}
