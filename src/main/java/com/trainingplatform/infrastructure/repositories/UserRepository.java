package com.trainingplatform.infrastructure.repositories;

import com.trainingplatform.core.entities.User;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.List;

@Repository
public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByEmail(String email);
    List<User> findByRole(String role);
    List<User> findByDepartment(String department);
    boolean existsByEmail(String email);
}