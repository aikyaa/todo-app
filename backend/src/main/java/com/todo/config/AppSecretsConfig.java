package com.todo.config;

import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.security.keyvault.secrets.SecretClient;
import com.azure.security.keyvault.secrets.SecretClientBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AppSecretsConfig {

    private static final Logger log = LoggerFactory.getLogger(AppSecretsConfig.class);

    @Value("${AZURE_KEYVAULT_URL:}")
    private String kvUrl;

    // Fallback: Spring Cloud Azure property source (if it ever starts working),
    // then ENRICH_SECRET env var, then local default.
    @Value("${enrich.secret:${ENRICH_SECRET:local-enrich-secret}}")
    private String enrichSecretFallback;

    /**
     * Fetches the enrich-secret from Key Vault when running in Azure,
     * or falls back to the ENRICH_SECRET env var / default for local dev.
     */
    @Bean
    public String enrichSecret() {
        if (kvUrl != null && !kvUrl.isEmpty()) {
            log.info("Fetching enrich-secret from Key Vault: {}", kvUrl);
            try {
                SecretClient client = new SecretClientBuilder()
                        .vaultUrl(kvUrl)
                        .credential(new DefaultAzureCredentialBuilder().build())
                        .buildClient();
                String value = client.getSecret("enrich-secret").getValue();
                log.info("Successfully fetched enrich-secret from Key Vault.");
                return value;
            } catch (Exception e) {
                log.warn("Failed to fetch enrich-secret from Key Vault ({}). Using fallback.", e.getMessage());
            }
        }
        log.info("Using fallback value for enrich-secret.");
        return enrichSecretFallback;
    }
}
