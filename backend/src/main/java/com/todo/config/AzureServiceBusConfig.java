package com.todo.config;

import com.azure.messaging.servicebus.ServiceBusClientBuilder;
import com.azure.messaging.servicebus.ServiceBusSenderClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AzureServiceBusConfig {

    @Value("${azure.servicebus.connection-string}")
    private String connectionString;

    @Value("${azure.servicebus.queue-name}")
    private String queueName;

    // ServiceBusSenderClient — used by AzureQueueService to send messages
    // Shared singleton bean — thread-safe, reuse across all requests
    @Bean
    public ServiceBusSenderClient serviceBusSenderClient() {
        return new ServiceBusClientBuilder()
                .connectionString(connectionString)
                .sender()
                .queueName(queueName)
                .buildClient();
    }
}
