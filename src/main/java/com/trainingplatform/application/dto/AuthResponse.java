package com.trainingplatform.application.dto;

import com.trainingplatform.core.entities.User;
import com.trainingplatform.core.entities.Rep;

public class AuthResponse {
    private String token;
    private User user;
    private Rep repProfile;

    // Constructors
    public AuthResponse() {}

    public AuthResponse(String token, User user, Rep repProfile) {
        this.token = token;
        this.user = user;
        this.repProfile = repProfile;
    }

    // Getters and Setters
    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public Rep getRepProfile() { return repProfile; }
    public void setRepProfile(Rep repProfile) { this.repProfile = repProfile; }
}