package com.todo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;

@Schema(description = "Returned after successful login or registration")
@Data
@AllArgsConstructor
public class AuthResponse {

    @Schema(description = "JWT token — include in Authorization: Bearer <token> header for all task requests")
    private String token;

    @Schema(example = "Aikya")
    private String name;

    @Schema(example = "aikya@example.com")
    private String email;
}
