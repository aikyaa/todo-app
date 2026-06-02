package com.todo.dto;

import lombok.Data;

import java.util.Map;

// Payload sent by Python ML service after processing a task
@Data
public class EnrichRequest {
    private Map<String, Object> extracted;    // keys: task, description, deadline, status
    private Map<String, Object> categorized;  // keys: category, priority
}
