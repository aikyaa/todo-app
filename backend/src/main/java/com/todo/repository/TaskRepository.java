package com.todo.repository;

import com.todo.model.Task;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
//table with task entity and string primary key
public interface TaskRepository extends JpaRepository<Task, String> {
    List<Task> findByUserIdOrderByCreatedAtDesc(String userId);
    List<Task> findByUserIdAndStatusOrderByCreatedAtDesc(String userId, Task.Status status);
}
