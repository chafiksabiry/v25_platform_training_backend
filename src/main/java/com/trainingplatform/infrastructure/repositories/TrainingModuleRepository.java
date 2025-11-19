package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.TrainingModule;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TrainingModuleRepository extends MongoRepository<TrainingModule, String> {
    List<TrainingModule> findByTrainingJourneyId(String trainingJourneyId);
    
    List<TrainingModule> findByTrainingJourneyIdOrderByOrderAsc(String trainingJourneyId);
    
    void deleteByTrainingJourneyId(String trainingJourneyId);
    
    long countByTrainingJourneyId(String trainingJourneyId);
}
