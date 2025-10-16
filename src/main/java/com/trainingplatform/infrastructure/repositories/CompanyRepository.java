package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.Company;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CompanyRepository extends MongoRepository<Company, String> {
    List<Company> findByIndustry(String industry);
    List<Company> findBySize(String size);
    List<Company> findBySetupComplete(boolean setupComplete);
}