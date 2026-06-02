package com.todo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Schema(description = "Request body for user login")
@Data
public class LoginRequest {

    @Schema(example = "aikya@example.com")
    @NotBlank @Email
    private String email;

    @Schema(example = "securepassword123")
    @NotBlank
    private String password;
}
