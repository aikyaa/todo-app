package com.todo.config;

import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.messaging.servicebus.ServiceBusClientBuilder;
import com.azure.messaging.servicebus.ServiceBusSenderClient;
import com.azure.security.keyvault.secrets.SecretClient;
import com.azure.security.keyvault.secrets.SecretClientBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AzureServiceBusConfig {

    private static final Logger log = LoggerFactory.getLogger(AzureServiceBusConfig.class);

    @Value("${azure.servicebus.connection-string:}")
    private String connectionString;

    @Value("${azure.servicebus.queue-name:task-queue}")
    private String queueName;

    @Value("${AZURE_KEYVAULT_URL:}")
    private String kvUrl;

    // Cached after first resolution so we only call KV once per startup
    private String resolvedConnectionString;

    @Bean
    public ServiceBusSenderClient serviceBusSenderClient() {
        String cs = resolveConnectionString();
        log.info("Building Service Bus sender for queue '{}'", queueName);
        return new ServiceBusClientBuilder()
                .connectionString(cs)
                .sender()
                .queueName(queueName)
                .buildClient();
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private synchronized String resolveConnectionString() {
        if (resolvedConnectionString != null) return resolvedConnectionString;

        // 1. Spring property source (if KV ConfigData ever works)
        if (connectionString != null && !connectionString.isEmpty()) {
            log.info("Service Bus connection string loaded via Spring property source.");
            resolvedConnectionString = connectionString;
            return resolvedConnectionString;
        }

        // 2. Direct KV SDK call — reliable after container warmup
        if (kvUrl != null && !kvUrl.isEmpty()) {
            log.info("Fetching servicebus-connection-string from Key Vault: {}", kvUrl);
            try {
                SecretClient secretClient = new SecretClientBuilder()
                        .vaultUrl(kvUrl)
                        .credential(new DefaultAzureCredentialBuilder().build())
                        .buildClient();
                resolvedConnectionString = secretClient.getSecret("servicebus-connection-string").getValue();
                log.info("Successfully fetched servicebus-connection-string from Key Vault.");
                return resolvedConnectionString;
            } catch (Exception e) {
                log.error("Failed to fetch servicebus-connection-string from Key Vault: {}", e.getMessage(), e);
                throw e;
            }
        }

        throw new IllegalStateException(
                "Service Bus connection string is not configured. " +
                "Set AZURE_SERVICEBUS_CONNECTION_STRING env var or configure Key Vault.");
    }
}
