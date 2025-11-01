package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.ManualTrainingModule;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ManualTrainingModuleRepository extends MongoRepository<ManualTrainingModule, String> {
    List<ManualTrainingModule> findByTrainingId(String trainingId);
    
    List<ManualTrainingModule> findByTrainingIdOrderByOrderIndexAsc(String trainingId);
    
    Optional<ManualTrainingModule> findByIdAndTrainingId(String id, String trainingId);
    
    void deleteByTrainingId(String trainingId);
    
    long countByTrainingId(String trainingId);
}

