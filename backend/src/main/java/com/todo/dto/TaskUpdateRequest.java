package com.todo.dto;

import lombok.Data;

// All fields optional — service only updates non-null fields
@Data
public class TaskUpdateRequest {
    private String title;
    private String description;
    private String deadline;  // ISO-8601 e.g. "2026-06-30T23:59:59"
    private String status;    // PENDING, IN_PROGRESS, COMPLETED
    private String category;
    private String priority;  // LOW, MEDIUM, HIGH, URGENT
}
