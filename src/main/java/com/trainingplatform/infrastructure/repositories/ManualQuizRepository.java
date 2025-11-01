package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.ManualQuiz;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ManualQuizRepository extends MongoRepository<ManualQuiz, String> {
    List<ManualQuiz> findByTrainingId(String trainingId);
    
    List<ManualQuiz> findByModuleId(String moduleId);
    
    Optional<ManualQuiz> findByIdAndTrainingId(String id, String trainingId);
    
    void deleteByTrainingId(String trainingId);
    
    void deleteByModuleId(String moduleId);
    
    long countByTrainingId(String trainingId);
    
    long countByModuleId(String moduleId);
}

