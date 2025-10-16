package com.trainingplatform.domain.repositories;

import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TrainingJourneyRepository extends MongoRepository<TrainingJourneyEntity, String> {
    
    /**
     * Find all journeys by status
     */
    List<TrainingJourneyEntity> findByStatus(String status);
    
    /**
     * Find journeys by industry
     */
    List<TrainingJourneyEntity> findByIndustry(String industry);
    
    /**
     * Find journeys that contain a specific rep ID in enrolled reps
     */
    List<TrainingJourneyEntity> findByEnrolledRepIdsContaining(String repId);
}

