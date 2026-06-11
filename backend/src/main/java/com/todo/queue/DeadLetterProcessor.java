package com.todo.queue;

// Dead letter handling removed — caused startup crash due to EntityPath conflict
// in the Service Bus connection string. Tasks that exhaust retries are handled
// by the TaskRetryScheduler instead.

