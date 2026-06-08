package com.todo.dto;

import lombok.Data;

// Flat payload sent by Python ML service after processing a task
@Data
public class EnrichRequest {
    private String task;
    private String description;
    private String deadline;
    private String status;
    private String category;
    private String priority;
}
