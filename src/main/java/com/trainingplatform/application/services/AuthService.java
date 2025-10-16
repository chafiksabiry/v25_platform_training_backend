package com.trainingplatform.application.services;

import com.trainingplatform.core.entities.User;
import com.trainingplatform.core.entities.Rep;
import com.trainingplatform.infrastructure.repositories.UserRepository;
import com.trainingplatform.infrastructure.repositories.RepRepository;
import com.trainingplatform.application.dto.LoginRequest;
import com.trainingplatform.application.dto.RegisterRequest;
import com.trainingplatform.application.dto.AuthResponse;
import com.trainingplatform.infrastructure.security.JwtTokenProvider;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class AuthService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private RepRepository repRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    
    @Autowired
    private AuthenticationManager authenticationManager;

    public AuthResponse login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );

        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new RuntimeException("User not found"));

        String token = jwtTokenProvider.generateToken(authentication);
        
        Rep repProfile = repRepository.findByUserId(user.getId()).orElse(null);

        return new AuthResponse(token, user, repProfile);
    }

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Email already exists");
        }

        User user = new User();
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole(request.getRole());
        user.setDepartment(request.getDepartment());
        
        Map<String, Object> aiProfile = new HashMap<>();
        aiProfile.put("strengths", new String[]{});
        aiProfile.put("improvementAreas", new String[]{});
        aiProfile.put("preferredLearningPace", "medium");
        aiProfile.put("motivationFactors", new String[]{});
        user.setAiPersonalityProfile(aiProfile);

        user = userRepository.save(user);

        // Create rep profile
        Rep rep = new Rep();
        rep.setUserId(user.getId());
        rep.setName(user.getName());
        rep.setEmail(user.getEmail());
        rep.setRole(user.getRole());
        rep.setDepartment(user.getDepartment());
        rep.setAiPersonalityProfile(aiProfile);
        
        rep = repRepository.save(rep);

        Authentication authentication = authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );

        String token = jwtTokenProvider.generateToken(authentication);

        return new AuthResponse(token, user, rep);
    }

    public User getCurrentUser(String email) {
        return userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
    }

    public Rep getRepProfile(String userId) {
        return repRepository.findByUserId(userId)
            .orElseThrow(() -> new RuntimeException("Rep profile not found"));
    }
}