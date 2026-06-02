package com.todo.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

// Payload sent to Azure Service Bus after a task is created — serialized to JSON for the message body
@Data
@NoArgsConstructor  // required by Jackson for JSON deserialization on the consumer side
@AllArgsConstructor
public class QueuedTaskPayload {
    private String taskId;
    private String rawInput;
}
