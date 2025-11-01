package com.trainingplatform.application.services;

import com.trainingplatform.core.entities.ManualTrainingModule;
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
public class ManualModuleService {
    
    private final ManualTrainingModuleRepository moduleRepository;
    private final ManualQuizRepository quizRepository;
    private final CloudinaryService cloudinaryService;
    
    /**
     * Create a new module
     */
    public ManualTrainingModule createModule(ManualTrainingModule module) {
        module.setId(UUID.randomUUID().toString());
        module.setCreatedAt(LocalDateTime.now());
        module.setUpdatedAt(LocalDateTime.now());
        
        // Set order index if not provided
        if (module.getOrderIndex() == null) {
            long count = moduleRepository.countByTrainingId(module.getTrainingId());
            module.setOrderIndex((int) count);
        }
        
        log.info("Creating new module: {} for training: {}", module.getTitle(), module.getTrainingId());
        return moduleRepository.save(module);
    }
    
    /**
     * Get all modules for a training
     */
    public List<ManualTrainingModule> getModulesByTraining(String trainingId) {
        return moduleRepository.findByTrainingIdOrderByOrderIndexAsc(trainingId);
    }
    
    /**
     * Get module by ID
     */
    public ManualTrainingModule getModuleById(String id) {
        return moduleRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Module not found: " + id));
    }
    
    /**
     * Update module
     */
    public ManualTrainingModule updateModule(String id, ManualTrainingModule module) {
        ManualTrainingModule existing = getModuleById(id);
        
        existing.setTitle(module.getTitle());
        existing.setDescription(module.getDescription());
        existing.setOrderIndex(module.getOrderIndex());
        existing.setEstimatedDuration(module.getEstimatedDuration());
        existing.setUpdatedAt(LocalDateTime.now());
        
        log.info("Updating module: {}", id);
        return moduleRepository.save(existing);
    }
    
    /**
     * Add section to module
     */
    public ManualTrainingModule addSection(String moduleId, ManualTrainingModule.TrainingSection section) {
        ManualTrainingModule module = getModuleById(moduleId);
        
        section.setId(UUID.randomUUID().toString());
        
        // Set order index if not provided
        if (section.getOrderIndex() == null) {
            section.setOrderIndex(module.getSections().size());
        }
        
        module.getSections().add(section);
        module.setUpdatedAt(LocalDateTime.now());
        
        log.info("Adding section to module: {}", moduleId);
        return moduleRepository.save(module);
    }
    
    /**
     * Update section
     */
    public ManualTrainingModule updateSection(String moduleId, String sectionId, ManualTrainingModule.TrainingSection updatedSection) {
        ManualTrainingModule module = getModuleById(moduleId);
        
        module.getSections().stream()
            .filter(s -> s.getId().equals(sectionId))
            .findFirst()
            .ifPresent(section -> {
                section.setTitle(updatedSection.getTitle());
                section.setType(updatedSection.getType());
                section.setContent(updatedSection.getContent());
                section.setOrderIndex(updatedSection.getOrderIndex());
                section.setEstimatedDuration(updatedSection.getEstimatedDuration());
            });
        
        module.setUpdatedAt(LocalDateTime.now());
        
        log.info("Updating section {} in module: {}", sectionId, moduleId);
        return moduleRepository.save(module);
    }
    
    /**
     * Delete section
     */
    public ManualTrainingModule deleteSection(String moduleId, String sectionId) {
        ManualTrainingModule module = getModuleById(moduleId);
        
        module.getSections().removeIf(s -> s.getId().equals(sectionId));
        module.setUpdatedAt(LocalDateTime.now());
        
        log.info("Deleting section {} from module: {}", sectionId, moduleId);
        return moduleRepository.save(module);
    }
    
    /**
     * Upload file for section
     */
    public ManualTrainingModule.ContentFile uploadFile(MultipartFile file, String fileType) throws IOException {
        CloudinaryService.CloudinaryUploadResult result;
        
        switch (fileType.toLowerCase()) {
            case "video":
                result = cloudinaryService.uploadVideo(file, "trainings/videos");
                break;
            case "image":
                result = cloudinaryService.uploadImage(file, "trainings/images");
                break;
            case "document":
            case "pdf":
            case "word":
                result = cloudinaryService.uploadDocument(file, "trainings/documents");
                break;
            default:
                throw new IOException("Unsupported file type: " + fileType);
        }
        
        ManualTrainingModule.FileMetadata metadata = ManualTrainingModule.FileMetadata.builder()
            .duration(result.getDuration() != null ? result.getDuration().intValue() : null)
            .width(result.getWidth())
            .height(result.getHeight())
            .format(result.getFormat())
            .build();
        
        return ManualTrainingModule.ContentFile.builder()
            .id(UUID.randomUUID().toString())
            .name(file.getOriginalFilename())
            .type(fileType)
            .url(result.getUrl())
            .publicId(result.getPublicId())
            .thumbnailUrl(result.getThumbnailUrl())
            .size(result.getBytes())
            .mimeType(file.getContentType())
            .metadata(metadata)
            .build();
    }
    
    /**
     * Delete module and associated quizzes
     */
    @Transactional
    public void deleteModule(String id) {
        ManualTrainingModule module = getModuleById(id);
        
        // Delete associated quizzes
        quizRepository.deleteByModuleId(id);
        
        // Delete module
        moduleRepository.delete(module);
        
        log.info("Deleted module: {}", id);
    }
    
    /**
     * Reorder modules
     */
    public void reorderModules(String trainingId, List<String> moduleIds) {
        for (int i = 0; i < moduleIds.size(); i++) {
            String moduleId = moduleIds.get(i);
            ManualTrainingModule module = getModuleById(moduleId);
            
            if (!module.getTrainingId().equals(trainingId)) {
                throw new RuntimeException("Module does not belong to training");
            }
            
            module.setOrderIndex(i);
            module.setUpdatedAt(LocalDateTime.now());
            moduleRepository.save(module);
        }
        
        log.info("Reordered {} modules for training: {}", moduleIds.size(), trainingId);
    }
    
    /**
     * Move section from one module to another
     */
    @Transactional
    public void moveSection(String fromModuleId, String toModuleId, String sectionId, Integer targetIndex) {
        // Get both modules
        ManualTrainingModule fromModule = getModuleById(fromModuleId);
        ManualTrainingModule toModule = getModuleById(toModuleId);
        
        // Find the section in the source module
        ManualTrainingModule.TrainingSection sectionToMove = fromModule.getSections().stream()
            .filter(s -> s.getId().equals(sectionId))
            .findFirst()
            .orElseThrow(() -> new RuntimeException("Section not found: " + sectionId));
        
        // Remove section from source module
        fromModule.getSections().removeIf(s -> s.getId().equals(sectionId));
        fromModule.setUpdatedAt(LocalDateTime.now());
        
        // Determine insertion index
        int insertIndex = targetIndex != null ? targetIndex : toModule.getSections().size();
        insertIndex = Math.min(insertIndex, toModule.getSections().size());
        
        // Set new order index for the section
        sectionToMove.setOrderIndex(insertIndex);
        
        // Insert section at the specified position
        toModule.getSections().add(insertIndex, sectionToMove);
        
        // Update order indices for all sections after the insertion point
        for (int i = insertIndex + 1; i < toModule.getSections().size(); i++) {
            toModule.getSections().get(i).setOrderIndex(i);
        }
        
        toModule.setUpdatedAt(LocalDateTime.now());
        
        // Save both modules
        moduleRepository.save(fromModule);
        moduleRepository.save(toModule);
        
        log.info("Moved section {} from module {} to module {} at index {}", 
            sectionId, fromModuleId, toModuleId, insertIndex);
    }
    
    /**
     * Reorder section within the same module
     */
    @Transactional
    public void reorderSection(String moduleId, String sectionId, int newIndex) {
        ManualTrainingModule module = getModuleById(moduleId);
        
        // Find the section
        ManualTrainingModule.TrainingSection sectionToMove = module.getSections().stream()
            .filter(s -> s.getId().equals(sectionId))
            .findFirst()
            .orElseThrow(() -> new RuntimeException("Section not found: " + sectionId));
        
        // Get current index
        int currentIndex = module.getSections().indexOf(sectionToMove);
        
        if (currentIndex == newIndex) {
            return; // No change needed
        }
        
        // Remove from current position
        module.getSections().remove(currentIndex);
        
        // Insert at new position
        int insertIndex = Math.min(newIndex, module.getSections().size());
        module.getSections().add(insertIndex, sectionToMove);
        
        // Update order indices for all sections
        for (int i = 0; i < module.getSections().size(); i++) {
            module.getSections().get(i).setOrderIndex(i);
        }
        
        module.setUpdatedAt(LocalDateTime.now());
        moduleRepository.save(module);
        
        log.info("Reordered section {} in module {} from index {} to {}", 
            sectionId, moduleId, currentIndex, newIndex);
    }
}

