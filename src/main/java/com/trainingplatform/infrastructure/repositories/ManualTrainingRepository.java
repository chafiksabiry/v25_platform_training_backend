package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.ManualTraining;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ManualTrainingRepository extends MongoRepository<ManualTraining, String> {
    List<ManualTraining> findByCompanyId(String companyId);
    
    List<ManualTraining> findByCompanyIdAndStatus(String companyId, String status);
    
    List<ManualTraining> findByStatus(String status);
    
    Optional<ManualTraining> findByIdAndCompanyId(String id, String companyId);
    
    long countByCompanyId(String companyId);
    
    long countByCompanyIdAndStatus(String companyId, String status);
}

