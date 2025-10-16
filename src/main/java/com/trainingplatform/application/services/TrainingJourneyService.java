package com.trainingplatform.application.services;

import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import com.trainingplatform.domain.repositories.TrainingJourneyRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class TrainingJourneyService {
    
    @Autowired
    private TrainingJourneyRepository journeyRepository;
    
    /**
     * Create or update a training journey
     */
    public TrainingJourneyEntity saveJourney(TrainingJourneyEntity journey) {
        if (journey.getId() == null) {
            journey.setCreatedAt(LocalDateTime.now());
        }
        journey.setUpdatedAt(LocalDateTime.now());
        
        return journeyRepository.save(journey);
    }
    
    /**
     * Launch a training journey
     */
    public TrainingJourneyEntity launchJourney(TrainingJourneyEntity journey, List<String> enrolledRepIds) {
        journey.setStatus("active");
        journey.setEnrolledRepIds(enrolledRepIds);
        journey.setLaunchDate(LocalDateTime.now());
        journey.setUpdatedAt(LocalDateTime.now());
        
        return journeyRepository.save(journey);
    }
    
    /**
     * Get a journey by ID
     */
    public Optional<TrainingJourneyEntity> getJourneyById(String id) {
        return journeyRepository.findById(id);
    }
    
    /**
     * Get all journeys
     */
    public List<TrainingJourneyEntity> getAllJourneys() {
        return journeyRepository.findAll();
    }
    
    /**
     * Get journeys by status
     */
    public List<TrainingJourneyEntity> getJourneysByStatus(String status) {
        return journeyRepository.findByStatus(status);
    }
    
    /**
     * Get journeys by industry
     */
    public List<TrainingJourneyEntity> getJourneysByIndustry(String industry) {
        return journeyRepository.findByIndustry(industry);
    }
    
    /**
     * Get journeys for a specific rep
     */
    public List<TrainingJourneyEntity> getJourneysForRep(String repId) {
        return journeyRepository.findByEnrolledRepIdsContaining(repId);
    }
    
    /**
     * Delete a journey
     */
    public void deleteJourney(String id) {
        journeyRepository.deleteById(id);
    }
    
    /**
     * Archive a journey (soft delete)
     */
    public TrainingJourneyEntity archiveJourney(String id) {
        Optional<TrainingJourneyEntity> journeyOpt = journeyRepository.findById(id);
        if (journeyOpt.isPresent()) {
            TrainingJourneyEntity journey = journeyOpt.get();
            journey.setStatus("archived");
            journey.setUpdatedAt(LocalDateTime.now());
            return journeyRepository.save(journey);
        }
        return null;
    }
}

