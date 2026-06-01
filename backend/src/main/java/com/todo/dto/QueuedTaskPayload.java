package com.todo.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

// Payload dropped into the queue after a task is created — worker uses this to call the ML service
@Data
@AllArgsConstructor
public class QueuedTaskPayload {
    private String taskId;
    private String rawInput;
}
