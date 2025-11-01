package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.TrainingProgress;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TrainingProgressRepository extends MongoRepository<TrainingProgress, String> {
    Optional<TrainingProgress> findByUserIdAndTrainingId(String userId, String trainingId);
    
    List<TrainingProgress> findByUserId(String userId);
    
    List<TrainingProgress> findByTrainingId(String trainingId);
    
    List<TrainingProgress> findByUserIdAndStatus(String userId, String status);
    
    List<TrainingProgress> findByTrainingIdAndStatus(String trainingId, String status);
    
    long countByTrainingId(String trainingId);
    
    long countByTrainingIdAndStatus(String trainingId, String status);
}

