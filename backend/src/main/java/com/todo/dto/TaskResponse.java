package com.todo.dto;

import com.todo.model.Task;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Schema(description = "Task returned by the API. Title is 'Processing…' until AI enrichment completes.")
@Data
@Builder
public class TaskResponse {

    @Schema(example = "a3f8c2d1-4b5e-6f7a-8c9d-0e1f2a3b4c5d")
    private String id;

    @Schema(example = "Submit quarterly report")
    private String title;

    @Schema(example = "Submit quarterly report by Friday, high priority")
    private String rawInput;

    @Schema(example = "Include Q2 financials and revenue projections")
    private String description;

    private LocalDateTime deadline;

    @Schema(allowableValues = {"PENDING", "IN_PROGRESS", "COMPLETED"}, example = "PENDING")
    private String status;

    @Schema(example = "WORK")
    private String category;

    @Schema(allowableValues = {"LOW", "MEDIUM", "HIGH", "URGENT"}, example = "HIGH")
    private String priority;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static TaskResponse from(Task t) {
        return TaskResponse.builder()
                .id(t.getId())
                .title(t.getTitle())
                .rawInput(t.getRawInput())
                .description(t.getDescription())
                .deadline(t.getDeadline())
                .status(t.getStatus().name())
                .category(t.getCategory())
                .priority(t.getPriority() != null ? t.getPriority().name() : null)
                .createdAt(t.getCreatedAt())
                .updatedAt(t.getUpdatedAt())
                .build();
    }
}
