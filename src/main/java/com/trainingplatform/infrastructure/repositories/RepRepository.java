package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.Rep;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.List;

@Repository
public interface RepRepository extends MongoRepository<Rep, String> {
    Optional<Rep> findByUserId(String userId);
    Optional<Rep> findByEmail(String email);
    List<Rep> findByRole(String role);
    List<Rep> findByDepartment(String department);
    List<Rep> findByRoleAndDepartment(String role, String department);
}