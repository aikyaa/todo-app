package com.todo.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity //tells hibernate that this class maps to a database table
@Table(name = "tasks")
@Getter @Setter
@NoArgsConstructor  // required by JPA
@AllArgsConstructor // required by @Builder
@Builder
public class Task {

    @Id //primary key
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // Owner of this task — set on creation, never changes
    @Column(name = "user_id", nullable = false)
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
