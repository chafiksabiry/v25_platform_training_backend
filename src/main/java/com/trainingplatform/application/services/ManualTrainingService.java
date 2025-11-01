package com.trainingplatform.application.services;

import com.trainingplatform.core.entities.ManualTraining;
import com.trainingplatform.core.entities.ManualTrainingModule;
import com.trainingplatform.infrastructure.repositories.ManualTrainingRepository;
import com.trainingplatform.infrastructure.repositories.ManualTrainingModuleRepository;
import com.trainingplatform.infrastructure.repositories.ManualQuizRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class ManualTrainingService {
    
    private final ManualTrainingRepository trainingRepository;
    private final ManualTrainingModuleRepository moduleRepository;
    private final ManualQuizRepository quizRepository;
    private final CloudinaryService cloudinaryService;
    
    /**
     * Create a new manual training
     */
    public ManualTraining createTraining(ManualTraining training) {
        training.setId(UUID.randomUUID().toString());
        training.setStatus("draft");
        training.setCreatedAt(LocalDateTime.now());
        training.setUpdatedAt(LocalDateTime.now());
        
        log.info("Creating new manual training: {}", training.getTitle());
        return trainingRepository.save(training);
    }
    
    /**
     * Get all trainings for a company
     */
    public List<ManualTraining> getTrainingsByCompany(String companyId) {
        return trainingRepository.findByCompanyId(companyId);
    }
    
    /**
     * Get training by ID
     */
    public ManualTraining getTrainingById(String id) {
        return trainingRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Training not found: " + id));
    }
    
    /**
     * Get training by ID and company
     */
    public ManualTraining getTrainingByIdAndCompany(String id, String companyId) {
        return trainingRepository.findByIdAndCompanyId(id, companyId)
            .orElseThrow(() -> new RuntimeException("Training not found: " + id));
    }
    
    /**
     * Update training
     */
    public ManualTraining updateTraining(String id, ManualTraining training) {
        ManualTraining existing = getTrainingById(id);
        
        existing.setTitle(training.getTitle());
        existing.setDescription(training.getDescription());
        existing.setMetadata(training.getMetadata());
        existing.setUpdatedAt(LocalDateTime.now());
        
        log.info("Updating training: {}", id);
        return trainingRepository.save(existing);
    }
    
    /**
     * Upload training thumbnail
     */
    public ManualTraining uploadThumbnail(String id, MultipartFile file) throws IOException {
        ManualTraining training = getTrainingById(id);
        
        CloudinaryService.CloudinaryUploadResult result = cloudinaryService.uploadImage(
            file, 
            "trainings/thumbnails"
        );
        
        training.setThumbnail(result.getUrl());
        training.setUpdatedAt(LocalDateTime.now());
        
        log.info("Uploaded thumbnail for training: {}", id);
        return trainingRepository.save(training);
    }
    
    /**
     * Publish training
     */
    public ManualTraining publishTraining(String id) {
        ManualTraining training = getTrainingById(id);
        
        // Validate training has modules
        long moduleCount = moduleRepository.countByTrainingId(id);
        if (moduleCount == 0) {
            throw new RuntimeException("Cannot publish training without modules");
        }
        
        training.setStatus("published");
        training.setUpdatedAt(LocalDateTime.now());
        
        log.info("Publishing training: {}", id);
        return trainingRepository.save(training);
    }
    
    /**
     * Archive training
     */
    public ManualTraining archiveTraining(String id) {
        ManualTraining training = getTrainingById(id);
        training.setStatus("archived");
        training.setUpdatedAt(LocalDateTime.now());
        
        log.info("Archiving training: {}", id);
        return trainingRepository.save(training);
    }
    
    /**
     * Delete training and all associated data
     */
    @Transactional
    public void deleteTraining(String id) {
        ManualTraining training = getTrainingById(id);
        
        // Delete all modules
        moduleRepository.deleteByTrainingId(id);
        
        // Delete all quizzes
        quizRepository.deleteByTrainingId(id);
        
        // Delete training
        trainingRepository.delete(training);
        
        log.info("Deleted training: {}", id);
    }
    
    /**
     * Get training statistics
     */
    public TrainingStats getTrainingStats(String companyId) {
        long total = trainingRepository.countByCompanyId(companyId);
        long published = trainingRepository.countByCompanyIdAndStatus(companyId, "published");
        long draft = trainingRepository.countByCompanyIdAndStatus(companyId, "draft");
        
        return TrainingStats.builder()
            .total(total)
            .published(published)
            .draft(draft)
            .build();
    }
    
    public static class TrainingStats {
        private long total;
        private long published;
        private long draft;
        
        public static TrainingStatsBuilder builder() {
            return new TrainingStatsBuilder();
        }
        
        public long getTotal() { return total; }
        public long getPublished() { return published; }
        public long getDraft() { return draft; }
        
        public static class TrainingStatsBuilder {
            private long total;
            private long published;
            private long draft;
            
            public TrainingStatsBuilder total(long total) {
                this.total = total;
                return this;
            }
            
            public TrainingStatsBuilder published(long published) {
                this.published = published;
                return this;
            }
            
            public TrainingStatsBuilder draft(long draft) {
                this.draft = draft;
                return this;
            }
            
            public TrainingStats build() {
                TrainingStats stats = new TrainingStats();
                stats.total = this.total;
                stats.published = this.published;
                stats.draft = this.draft;
                return stats;
            }
        }
    }
}

