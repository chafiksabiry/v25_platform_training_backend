package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.ExamFinalQuiz;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ExamFinalQuizRepository extends MongoRepository<ExamFinalQuiz, String> {
    List<ExamFinalQuiz> findByTrainingId(String trainingId);
    
    List<ExamFinalQuiz> findByJourneyId(String journeyId);
    
    Optional<ExamFinalQuiz> findByIdAndTrainingId(String id, String trainingId);
    
    Optional<ExamFinalQuiz> findFirstByJourneyId(String journeyId); // Get first exam by journey ID
    
    void deleteByTrainingId(String trainingId);
    
    void deleteByJourneyId(String journeyId);
    
    long countByTrainingId(String trainingId);
    
    long countByJourneyId(String journeyId);
}

