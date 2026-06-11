package com.todo.repository;

import com.todo.model.Task;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TaskRepository extends JpaRepository<Task, String> {
    List<Task> findByUserIdOrderByCreatedAtDesc(String userId);
    List<Task> findByUserIdAndStatusOrderByCreatedAtDesc(String userId, Task.Status status);

    // Tasks stuck in PENDING, not currently in the queue — updatedAt used as the retry clock
    List<Task> findByEnrichedFalseAndInQueueFalseAndStatusAndUpdatedAtBefore(
            Task.Status status, LocalDateTime cutoff);
}
