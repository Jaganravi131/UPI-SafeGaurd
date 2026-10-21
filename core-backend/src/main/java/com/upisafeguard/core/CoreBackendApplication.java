package com.upisafeguard.core;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.client.RestClient;

@SpringBootApplication
public class CoreBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(CoreBackendApplication.class, args);
    }

    @Bean
    RestClient riskServiceRestClient(RestClient.Builder builder) {
        return builder.build();
    }
}
