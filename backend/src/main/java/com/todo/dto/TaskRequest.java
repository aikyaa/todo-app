package com.todo.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class TaskRequest {

    @NotBlank(message = "rawInput is required")
    private String rawInput;
}
