package com.todo.repository;

import com.todo.model.Task;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
//create a repo for entity Task with primary key type String
public interface TaskRepository extends JpaRepository<Task, String> {
    List<Task> findByUserIdOrderByCreatedAtDesc(String userId); //spring data derives sql query from method name
    List<Task> findByUserIdAndStatusOrderByCreatedAtDesc(String userId, Task.Status status);
}
