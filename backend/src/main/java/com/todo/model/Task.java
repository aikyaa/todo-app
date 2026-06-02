package com.todo.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "tasks", indexes = {
    @Index(name = "idx_tasks_user_id",        columnList = "user_id"),
    @Index(name = "idx_tasks_user_id_status", columnList = "user_id, status")
})
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private String userId;

    @Column(nullable = false)
    private String title;

    @Column(name = "raw_input", columnDefinition = "TEXT")
    private String rawInput;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column
    private LocalDateTime deadline;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private Status status = Status.PENDING;

    @Column
    private String category;

    @Enumerated(EnumType.STRING)
    @Column
    @Builder.Default
    private Priority priority = Priority.MEDIUM;

    @Builder.Default
    @Column(nullable = false)
    private boolean enriched = false;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public enum Status   { PENDING, IN_PROGRESS, COMPLETED }
    public enum Priority { LOW, MEDIUM, HIGH, URGENT }
}
