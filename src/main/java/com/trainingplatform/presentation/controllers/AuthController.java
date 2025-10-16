package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.AuthService;
import com.trainingplatform.application.dto.LoginRequest;
import com.trainingplatform.application.dto.RegisterRequest;
import com.trainingplatform.application.dto.AuthResponse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {
    
    @Autowired
    private AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        try {
            AuthResponse response = authService.login(request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        try {
            AuthResponse response = authService.register(request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/me")
    public ResponseEntity<Object> getCurrentUser() {
        // Implementation would get current user from JWT token
        return ResponseEntity.ok().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Object> logout() {
        // Implementation would invalidate JWT token
        return ResponseEntity.ok().build();
    }
}