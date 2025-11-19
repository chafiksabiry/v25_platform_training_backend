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
@Document(collection = "module_quizzes")
public class ModuleQuiz {
    @Id
    private String _id;
    
    private String moduleId;
    private String trainingId;
    private String title;
    private String description;
    
    @Builder.Default
    private List<QuizQuestion> questions = new ArrayList<>();
    
    private Integer passingScore; // percentage
    private Integer timeLimit; // in minutes, null for unlimited
    private Integer maxAttempts;
    
    private QuizSettings settings;
    
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuizQuestion {
        private String _id;
        private String question;
        private String type; // multiple-choice, true-false, short-answer, essay
        private List<String> options;
        private Object correctAnswer; // Can be String, Integer, Boolean, or List<Integer>
        private String explanation;
        private Integer points;
        private Integer orderIndex;
        private String imageUrl;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuizSettings {
        private Boolean shuffleQuestions;
        private Boolean shuffleOptions;
        private Boolean showCorrectAnswers;
        private Boolean allowReview;
        private Boolean showExplanations;
    }
}

