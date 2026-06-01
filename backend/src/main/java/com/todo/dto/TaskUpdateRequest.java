package com.todo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

// All fields optional — service only updates non-null fields
@Schema(description = "Request body for updating a task. All fields are optional.")
@Data
public class TaskUpdateRequest {

    @Schema(example = "Submit quarterly report")
    private String title;

    @Schema(example = "Include Q2 financials and projections")
    private String description;

    @Schema(description = "ISO-8601 datetime", example = "2026-06-30T23:59:59")
    private String deadline;

    @Schema(allowableValues = {"PENDING", "IN_PROGRESS", "COMPLETED"}, example = "IN_PROGRESS")
    private String status;

    @Schema(example = "WORK")
    private String category;

    @Schema(allowableValues = {"LOW", "MEDIUM", "HIGH", "URGENT"}, example = "HIGH")
    private String priority;
}
