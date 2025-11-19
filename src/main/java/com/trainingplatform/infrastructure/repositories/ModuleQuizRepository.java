package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.ModuleQuiz;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ModuleQuizRepository extends MongoRepository<ModuleQuiz, String> {
    List<ModuleQuiz> findByTrainingId(String trainingId);
    
    List<ModuleQuiz> findByModuleId(String moduleId);
    
    @Query("{ '_id': ?0, 'trainingId': ?1 }")
    Optional<ModuleQuiz> findByIdAndTrainingId(String id, String trainingId);
    
    void deleteByTrainingId(String trainingId);
    
    void deleteByModuleId(String moduleId);
    
    long countByTrainingId(String trainingId);
    
    long countByModuleId(String moduleId);
}

