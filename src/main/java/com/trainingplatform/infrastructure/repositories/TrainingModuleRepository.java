package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.TrainingModule;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TrainingModuleRepository extends MongoRepository<TrainingModule, String> {
    List<TrainingModule> findByJourneyId(String journeyId);
    List<TrainingModule> findByJourneyIdOrderByOrderIndex(String journeyId);
    List<TrainingModule> findByDifficulty(String difficulty);
    List<TrainingModule> findByModuleType(String moduleType);
}