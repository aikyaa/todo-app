package com.todo.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI todoAIOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("TodoAI API")
                        .description("Natural language task manager — AI extracts title, deadline, category and priority from plain English input.")
                        .version("1.0.0")
                        .contact(new Contact().name("TodoAI").email("support@todoai.com")))
                .servers(List.of(new Server().url("http://localhost:8080").description("Local")));
    }
}
