package com.trainingplatform.infrastructure.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Filtre CORS explicite qui s'exécute AVANT Spring Security
 * pour gérer toutes les requêtes OPTIONS (preflight)
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorsFilter implements Filter {

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        
        HttpServletResponse response = (HttpServletResponse) res;
        HttpServletRequest request = (HttpServletRequest) req;

        // ✅ Headers CORS permissifs pour le développement et production
        String origin = request.getHeader("Origin");
        
        // Toujours autoriser toutes les origines pour le développement
        if (origin != null && !origin.isEmpty()) {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Access-Control-Allow-Credentials", "true");
        } else {
            // Si pas d'origine spécifiée, autoriser toutes (sans credentials)
            response.setHeader("Access-Control-Allow-Origin", "*");
            response.setHeader("Access-Control-Allow-Credentials", "false");
        }
        
        // Headers CORS essentiels
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD");
        response.setHeader("Access-Control-Max-Age", "3600");
        response.setHeader("Access-Control-Allow-Headers", 
            "Origin, X-Requested-With, Content-Type, Accept, Authorization, " +
            "Access-Control-Request-Method, Access-Control-Request-Headers, " +
            "X-Requested-With, Cache-Control, Pragma");
        response.setHeader("Access-Control-Expose-Headers", 
            "Authorization, Content-Type, X-Total-Count, Content-Length");

        // ✅ Si c'est une requête OPTIONS (preflight), on répond immédiatement avec 200 OK
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            response.setStatus(HttpServletResponse.SC_OK);
            response.setContentLength(0);
            return;
        }

        chain.doFilter(req, res);
    }

    @Override
    public void init(FilterConfig filterConfig) {
        // Initialization if needed
    }

    @Override
    public void destroy() {
        // Cleanup if needed
    }
}

