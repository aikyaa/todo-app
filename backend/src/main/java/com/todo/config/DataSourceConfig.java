package com.todo.config;

import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.security.keyvault.secrets.SecretClient;
import com.azure.security.keyvault.secrets.SecretClientBuilder;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;

@Configuration
public class DataSourceConfig {

    private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

    @Value("${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/tododb}")
    private String url;

    @Value("${DB_USERNAME:postgres}")
    private String username;

    @Value("${AZURE_KEYVAULT_URL:}")
    private String kvUrl;

    // Fallback when KV is unavailable (local dev or KV unreachable)
    @Value("${DB_PASSWORD:postgres}")
    private String passwordFallback;

    /**
     * Overrides Spring Boot's auto-configured DataSource.
     * Fetches the DB password from Key Vault when running in Azure,
     * falls back to DB_PASSWORD env var for local dev.
     */
    @Primary
    @Bean
    public DataSource dataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setUsername(username);
        config.setPassword(resolvePassword());
        config.setDriverClassName("org.postgresql.Driver");
        return new HikariDataSource(config);
    }

    private String resolvePassword() {
        if (kvUrl != null && !kvUrl.isEmpty()) {
            // Retry up to 5 times with 3s delay — managed identity IMDS endpoint
            // may not be warm immediately at container startup
            int attempts = 5;
            for (int i = 1; i <= attempts; i++) {
                try {
                    log.info("Fetching pg-password from Key Vault (attempt {}/{})", i, attempts);
                    SecretClient client = new SecretClientBuilder()
                            .vaultUrl(kvUrl)
                            .credential(new DefaultAzureCredentialBuilder().build())
                            .buildClient();
                    String value = client.getSecret("pg-password").getValue();
                    log.info("Successfully fetched pg-password from Key Vault.");
                    return value;
                } catch (Exception e) {
                    log.warn("Attempt {}/{} failed to fetch pg-password from Key Vault: {}", i, attempts, e.getMessage());
                    if (i < attempts) {
                        try { Thread.sleep(3000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                    } else {
                        throw new IllegalStateException("Cannot start — failed to fetch pg-password from Key Vault after " + attempts + " attempts: " + e.getMessage(), e);
                    }
                }
            }
        }
        log.info("Using DB_PASSWORD env var fallback for pg-password.");
        return passwordFallback;
    }
}
