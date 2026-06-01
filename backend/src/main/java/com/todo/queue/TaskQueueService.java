package com.todo.queue;

import com.todo.dto.QueuedTaskPayload;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

@Slf4j
@Service
public class TaskQueueService {

    // Thread-safe in-memory queue — HTTP thread writes, worker thread reads
    private final BlockingQueue<QueuedTaskPayload> queue = new LinkedBlockingQueue<>();

    public void enqueue(QueuedTaskPayload payload) {
        queue.offer(payload);
        log.info("Queued task {}", payload.getTaskId());
    }

    // Blocks the calling thread until an item is available
    public QueuedTaskPayload take() throws InterruptedException {
        return queue.take();
    }
}
