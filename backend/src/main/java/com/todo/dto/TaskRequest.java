package com.todo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Schema(description = "Request body for creating a new task")
@Data
public class TaskRequest {

    @Schema(description = "Raw natural language task description", example = "Finish the quarterly report by Friday, high priority")
    @NotBlank(message = "rawInput is required")
    private String rawInput;
}
