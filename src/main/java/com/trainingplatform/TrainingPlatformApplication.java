package com.trainingplatform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.mongodb.config.EnableMongoAuditing;

@SpringBootApplication
@EnableMongoAuditing
public class TrainingPlatformApplication {
    public static void main(String[] args) {
        SpringApplication.run(TrainingPlatformApplication.class, args);
    }
}