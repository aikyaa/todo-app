package com.todo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Schema(description = "Request body for user registration")
@Data
public class RegisterRequest {

    @Schema(example = "Aikya")
    @NotBlank(message = "Name is required")
    private String name;

    @Schema(example = "aikya@example.com")
    @NotBlank @Email(message = "Valid email is required")
    private String email;

    @Schema(example = "securepassword123")
    @NotBlank @Size(min = 6, message = "Password must be at least 6 characters")
    private String password;
}
