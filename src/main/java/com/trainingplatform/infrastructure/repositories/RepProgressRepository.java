package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.RepProgress;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RepProgressRepository extends MongoRepository<RepProgress, String> {
    List<RepProgress> findByRepId(String repId);
    List<RepProgress> findByJourneyId(String journeyId);
    List<RepProgress> findByModuleId(String moduleId);
    List<RepProgress> findByRepIdAndJourneyId(String repId, String journeyId);
    Optional<RepProgress> findByRepIdAndJourneyIdAndModuleId(String repId, String journeyId, String moduleId);
    List<RepProgress> findByStatus(String status);
}