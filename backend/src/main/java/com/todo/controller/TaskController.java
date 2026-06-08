package com.todo.controller;

import com.todo.dto.EnrichRequest;
import com.todo.dto.TaskRequest;
import com.todo.dto.TaskResponse;
import com.todo.dto.TaskUpdateRequest;
import com.todo.model.User;
import com.todo.service.TaskService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;

    // Shared secret Python must send in X-Enrich-Secret header
    @Value("${app.enrich-secret}")
    private String enrichSecret;

    @PostMapping
    public ResponseEntity<TaskResponse> create(@Valid @RequestBody TaskRequest req,
                                               @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.create(req.getRawInput(), user.getId()));
    }

    @GetMapping
    public ResponseEntity<List<TaskResponse>> getAll(
            @RequestParam(required = false) String status,
            @AuthenticationPrincipal User user) {
        if (status != null) return ResponseEntity.ok(taskService.getByStatus(status, user.getId()));
        return ResponseEntity.ok(taskService.getAll(user.getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<TaskResponse> getOne(@PathVariable String id,
                                               @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.getOne(id, user.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<TaskResponse> update(@PathVariable String id,
                                               @RequestBody TaskUpdateRequest req,
                                               @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.update(id, req, user.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id,
                                       @AuthenticationPrincipal User user) {
        taskService.delete(id, user.getId());
        return ResponseEntity.noContent().build();
    }

    // Called by Python ML service after processing a task from the queue
    // Secured by shared secret in X-Enrich-Secret header — not a user-facing endpoint
    @PutMapping("/{id}/enrich")
    public ResponseEntity<Void> enrich(@PathVariable String id,
                                       @RequestHeader("X-Enrich-Secret") String secret,
                                       @RequestBody EnrichRequest req) {
        if (!enrichSecret.equals(secret))
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        taskService.enrich(id, req);
        return ResponseEntity.noContent().build();
    }
}
