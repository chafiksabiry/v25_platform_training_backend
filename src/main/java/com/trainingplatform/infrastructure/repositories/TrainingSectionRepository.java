package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.TrainingSection;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TrainingSectionRepository extends MongoRepository<TrainingSection, String> {
    List<TrainingSection> findByModuleId(String moduleId);
    
    List<TrainingSection> findByModuleIdOrderByOrderAsc(String moduleId);
    
    void deleteByModuleId(String moduleId);
    
    long countByModuleId(String moduleId);
}

