package com.todo.dto;

import com.todo.model.Task;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class TaskResponse {
    private String id;
    private String title;
    private String rawInput;
    private String description;
    private LocalDateTime deadline;
    private String status;
    private String category;
    private String priority;
    private boolean enriched;
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
                .priority(t.getPriority().name())
                .enriched(t.isEnriched())
                .createdAt(t.getCreatedAt())
                .updatedAt(t.getUpdatedAt())
                .build();
    }
}
