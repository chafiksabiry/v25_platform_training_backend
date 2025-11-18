package com.trainingplatform.domain.repositories;

import com.trainingplatform.domain.entities.IndustryEntity;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface IndustryRepository extends MongoRepository<IndustryEntity, String> {
}

