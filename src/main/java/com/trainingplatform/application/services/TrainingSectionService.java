package com.trainingplatform.application.services;

import com.trainingplatform.core.entities.TrainingSection;
import com.trainingplatform.infrastructure.repositories.TrainingSectionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class TrainingSectionService {
    
    private final TrainingSectionRepository sectionRepository;
    
    /**
     * Create a new training section
     */
    public TrainingSection createSection(TrainingSection section) {
        section.set_id(UUID.randomUUID().toString());
        section.setCreatedAt(LocalDateTime.now());
        section.setUpdatedAt(LocalDateTime.now());
        
        log.info("Creating new training section: {} for module: {}", section.getTitle(), section.getModuleId());
        return sectionRepository.save(section);
    }
    
    /**
     * Get all sections for a module
     */
    public List<TrainingSection> getSectionsByModule(String moduleId) {
        return sectionRepository.findByModuleIdOrderByOrderAsc(moduleId);
    }
    
    /**
     * Get section by ID
     */
    public TrainingSection getSectionById(String id) {
        return sectionRepository.findById(id).orElse(null);
    }
    
    /**
     * Update section
     */
    public TrainingSection updateSection(TrainingSection section) {
        section.setUpdatedAt(LocalDateTime.now());
        return sectionRepository.save(section);
    }
    
    /**
     * Delete section
     */
    public void deleteSection(String id) {
        sectionRepository.deleteById(id);
    }
    
    /**
     * Delete all sections for a module
     */
    public void deleteSectionsByModule(String moduleId) {
        sectionRepository.deleteByModuleId(moduleId);
    }
}

