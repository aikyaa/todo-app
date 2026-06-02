package com.todo.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Slf4j
@Service
public class MLService {

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.ml-service.url}") //from application.yml (config)
    private String mlServiceUrl;

    // POST /extract — returns { task, description, deadline, status, priority_hint }
    @SuppressWarnings("unchecked")
    public Map<String, Object> extract(String rawInput) {
        try {
            HttpEntity<Map<String, Object>> req = new HttpEntity<>(Map.of("raw_input", rawInput), jsonHeaders());
            //map.class tells Jackson to convert JSON to map
            ResponseEntity<Map> res = restTemplate.postForEntity(mlServiceUrl + "/extract", req, Map.class);
            return res.getBody() != null ? res.getBody() : Map.of();
        } catch (Exception e) {
            log.error("ML /extract failed: {}", e.getMessage());
            return Map.of();
        }
    }

    // POST /categorize — returns { category, priority }
    // HashMap used instead of Map.of() because priority_hint can be null
    @SuppressWarnings("unchecked")
    public Map<String, Object> categorize(String title, String description, String deadline, String priorityHint) {
        try {
            var body = new java.util.HashMap<String, Object>();
            body.put("task",          title        != null ? title        : "");
            body.put("description",   description  != null ? description  : "");
            body.put("deadline",      deadline     != null ? deadline     : "");
            body.put("priority_hint", priorityHint != null ? priorityHint : "");
            HttpEntity<Map<String, Object>> req = new HttpEntity<>(body, jsonHeaders());
            ResponseEntity<Map> res = restTemplate.postForEntity(mlServiceUrl + "/categorize", req, Map.class);
            return res.getBody() != null ? res.getBody() : Map.of();
        } catch (Exception e) {
            log.error("ML /categorize failed: {}", e.getMessage());
            return Map.of();
        }
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
}
