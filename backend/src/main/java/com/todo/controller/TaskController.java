package com.todo.controller;

import com.todo.dto.TaskRequest;
import com.todo.dto.TaskResponse;
import com.todo.dto.TaskUpdateRequest;
import com.todo.model.User;
import com.todo.service.TaskService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController //routes requests to methods of this class, JSON conversion
@RequestMapping("/api/tasks") //adds prefix
@CrossOrigin(origins = "http://localhost:3000") //allows frontend to call backend
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;

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

    // @PathVariable extracts the id segment from the URL
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
        return ResponseEntity.noContent().build();//sets 204, success with no content
    }
}
