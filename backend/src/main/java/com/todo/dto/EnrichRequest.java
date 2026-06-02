package com.todo.dto;

import lombok.Data;

import java.util.Map;

// Payload sent by Python ML service after processing a task
@Data
public class EnrichRequest {
    private Map<String, Object> extracted;    // from /extract — title, description, deadline, status, priority_hint
    private Map<String, Object> categorized;  // from /categorize — category, priority
}
