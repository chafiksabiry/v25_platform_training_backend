package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "training_modules")
public class TrainingModule {
    @Id
    private String _id;
    
    private String trainingJourneyId; // Reference to TrainingJourney (ObjectId)
    private String title;
    private String description;
    private Integer duration; // in minutes
    private String difficulty; // beginner, intermediate, advanced
    @Builder.Default
    private List<String> learningObjectives = new ArrayList<>();
    @Builder.Default
    private List<String> prerequisites = new ArrayList<>();
    @Builder.Default
    private List<String> topics = new ArrayList<>();
    @Builder.Default
    private List<String> sectionIds = new ArrayList<>(); // References to Section documents (ObjectIds)
    @Builder.Default
    private List<String> quizIds = new ArrayList<>(); // References to ModuleQuiz documents (ObjectIds)
    private Integer order; // Order within the training journey
    
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
