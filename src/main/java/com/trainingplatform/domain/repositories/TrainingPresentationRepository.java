package com.trainingplatform.domain.repositories;

import com.trainingplatform.domain.entities.TrainingPresentationEntity;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface TrainingPresentationRepository extends MongoRepository<TrainingPresentationEntity, String> {
    List<TrainingPresentationEntity> findByCompanyId(String companyId);
    List<TrainingPresentationEntity> findByGigId(String gigId);
}
