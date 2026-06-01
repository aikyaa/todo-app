package com.todo.controller;

import com.todo.dto.TaskRequest;
import com.todo.dto.TaskResponse;
import com.todo.dto.TaskUpdateRequest;
import com.todo.service.TaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin(origins = "http://localhost:3000")
@RequiredArgsConstructor
@Tag(name = "Tasks", description = "CRUD operations for tasks. Tasks are enriched asynchronously by the AI pipeline after creation.")
public class TaskController {

    private final TaskService taskService;

    @Operation(summary = "Create a task", description = "Returns a skeleton task immediately. Poll GET /{id} until title changes from 'Processing…'.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Skeleton task created", content = @Content(schema = @Schema(implementation = TaskResponse.class))),
            @ApiResponse(responseCode = "400", description = "rawInput is blank", content = @Content)
    })
    @PostMapping
    public ResponseEntity<TaskResponse> create(@Valid @RequestBody TaskRequest req) {
        return ResponseEntity.ok(taskService.create(req.getRawInput()));
    }

    @Operation(summary = "Get all tasks", description = "Optionally filter by ?status=PENDING|IN_PROGRESS|COMPLETED")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Tasks returned"),
            @ApiResponse(responseCode = "400", description = "Invalid status value", content = @Content)
    })
    @GetMapping
    public ResponseEntity<List<TaskResponse>> getAll(
            @Parameter(description = "Filter by status: PENDING, IN_PROGRESS, COMPLETED")
            @RequestParam(required = false) String status) {
        if (status != null) return ResponseEntity.ok(taskService.getByStatus(status));
        return ResponseEntity.ok(taskService.getAll());
    }

    @Operation(summary = "Get a task by ID")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Task found", content = @Content(schema = @Schema(implementation = TaskResponse.class))),
            @ApiResponse(responseCode = "404", description = "Task not found", content = @Content)
    })
    @GetMapping("/{id}")
    public ResponseEntity<TaskResponse> getOne(@Parameter(description = "Task UUID") @PathVariable String id) {
        return ResponseEntity.ok(taskService.getOne(id));
    }

    @Operation(summary = "Update a task", description = "Partial update — only non-null fields are applied.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Task updated", content = @Content(schema = @Schema(implementation = TaskResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid status or priority", content = @Content),
            @ApiResponse(responseCode = "404", description = "Task not found", content = @Content)
    })
    @PutMapping("/{id}")
    public ResponseEntity<TaskResponse> update(
            @Parameter(description = "Task UUID") @PathVariable String id,
            @RequestBody TaskUpdateRequest req) {
        return ResponseEntity.ok(taskService.update(id, req));
    }

    @Operation(summary = "Delete a task")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Deleted", content = @Content),
            @ApiResponse(responseCode = "404", description = "Task not found", content = @Content)
    })
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@Parameter(description = "Task UUID") @PathVariable String id) {
        taskService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
