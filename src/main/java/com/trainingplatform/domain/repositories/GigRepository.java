package com.trainingplatform.domain.repositories;

import com.trainingplatform.domain.entities.GigEntity;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface GigRepository extends MongoRepository<GigEntity, String> {
    Optional<GigEntity> findById(String id);
}

