package com.todo.controller;

import com.todo.dto.TaskRequest;
import com.todo.dto.TaskResponse;
import com.todo.dto.TaskUpdateRequest;
import com.todo.model.User;
import com.todo.service.TaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin(origins = "http://localhost:3000")
@RequiredArgsConstructor
@Tag(name = "Tasks", description = "CRUD operations for tasks. Requires Bearer JWT token. Tasks are scoped to the authenticated user.")
@SecurityRequirement(name = "bearerAuth") // tells Swagger UI to send Authorization header for all endpoints in this controller
public class TaskController {

    private final TaskService taskService;

    @Operation(summary = "Create a task", description = "Returns a skeleton task immediately. Poll GET /{id} until title changes from 'Processing…'.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Skeleton task created", content = @Content(schema = @Schema(implementation = TaskResponse.class))),
            @ApiResponse(responseCode = "400", description = "rawInput is blank", content = @Content),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT", content = @Content)
    })
    @PostMapping
    public ResponseEntity<TaskResponse> create(@Valid @RequestBody TaskRequest req,
                                               @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.create(req.getRawInput(), user.getId()));
    }

    @Operation(summary = "Get all tasks", description = "Returns only tasks belonging to the authenticated user. Optionally filter by ?status=")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Tasks returned"),
            @ApiResponse(responseCode = "400", description = "Invalid status value", content = @Content),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT", content = @Content)
    })
    @GetMapping
    public ResponseEntity<List<TaskResponse>> getAll(
            @Parameter(description = "Filter by status: PENDING, IN_PROGRESS, COMPLETED")
            @RequestParam(required = false) String status,
            @AuthenticationPrincipal User user) {
        if (status != null) return ResponseEntity.ok(taskService.getByStatus(status, user.getId()));
        return ResponseEntity.ok(taskService.getAll(user.getId()));
    }

    @Operation(summary = "Get a task by ID")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Task found", content = @Content(schema = @Schema(implementation = TaskResponse.class))),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT", content = @Content),
            @ApiResponse(responseCode = "404", description = "Task not found or belongs to another user", content = @Content)
    })
    @GetMapping("/{id}")
    public ResponseEntity<TaskResponse> getOne(@Parameter(description = "Task UUID") @PathVariable String id,
                                               @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.getOne(id, user.getId()));
    }

    @Operation(summary = "Update a task", description = "Partial update — only non-null fields are applied.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Task updated", content = @Content(schema = @Schema(implementation = TaskResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid status or priority", content = @Content),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT", content = @Content),
            @ApiResponse(responseCode = "404", description = "Task not found or belongs to another user", content = @Content)
    })
    @PutMapping("/{id}")
    public ResponseEntity<TaskResponse> update(
            @Parameter(description = "Task UUID") @PathVariable String id,
            @RequestBody TaskUpdateRequest req,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.update(id, req, user.getId()));
    }

    @Operation(summary = "Delete a task")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Deleted", content = @Content),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT", content = @Content),
            @ApiResponse(responseCode = "404", description = "Task not found or belongs to another user", content = @Content)
    })
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@Parameter(description = "Task UUID") @PathVariable String id,
                                       @AuthenticationPrincipal User user) {
        taskService.delete(id, user.getId());
        return ResponseEntity.noContent().build();
    }
}
