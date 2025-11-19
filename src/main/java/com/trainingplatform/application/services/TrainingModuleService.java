package com.trainingplatform.application.services;

import com.trainingplatform.core.entities.TrainingModule;
import com.trainingplatform.infrastructure.repositories.TrainingModuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class TrainingModuleService {
    
    private final TrainingModuleRepository moduleRepository;
    
    /**
     * Create a new training module
     */
    public TrainingModule createModule(TrainingModule module) {
        module.set_id(UUID.randomUUID().toString());
        module.setCreatedAt(LocalDateTime.now());
        module.setUpdatedAt(LocalDateTime.now());
        
        log.info("Creating new training module: {} for journey: {}", module.getTitle(), module.getTrainingJourneyId());
        return moduleRepository.save(module);
    }
    
    /**
     * Get all modules for a training journey
     */
    public List<TrainingModule> getModulesByTrainingJourney(String trainingJourneyId) {
        return moduleRepository.findByTrainingJourneyIdOrderByOrderAsc(trainingJourneyId);
    }
    
    /**
     * Get module by ID
     */
    public TrainingModule getModuleById(String id) {
        return moduleRepository.findById(id).orElse(null);
    }
    
    /**
     * Update module
     */
    public TrainingModule updateModule(TrainingModule module) {
        module.setUpdatedAt(LocalDateTime.now());
        return moduleRepository.save(module);
    }
    
    /**
     * Delete module
     */
    public void deleteModule(String id) {
        moduleRepository.deleteById(id);
    }
    
    /**
     * Delete all modules for a training journey
     */
    public void deleteModulesByTrainingJourney(String trainingJourneyId) {
        moduleRepository.deleteByTrainingJourneyId(trainingJourneyId);
    }
}

