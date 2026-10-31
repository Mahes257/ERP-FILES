package com.vishatech.erp.service;

import com.vishatech.erp.dto.AuthResponse;
import com.vishatech.erp.dto.LoginRequest;
import com.vishatech.erp.dto.RegisterRequest;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.exception.DuplicateResourceException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.exception.TooManyRequestsException;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.security.RateLimiter;
import com.vishatech.erp.security.SecurityAuditLogger;
import com.vishatech.erp.util.AuditContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecurityAuditLogger auditLogger;
    private final AuditContext auditContext;
    private final RateLimiter rateLimiter;
    private final RefreshTokenService refreshTokenService;
    private final int loginMaxPerEmailIp;
    private final long loginWindowMs;

    public AuthService(AuthenticationManager authenticationManager,
                       UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       SecurityAuditLogger auditLogger,
                       AuditContext auditContext,
                       RateLimiter rateLimiter,
                       RefreshTokenService refreshTokenService,
                       @Value("${app.rate-limit.login.max-per-email-ip:10}") int loginMaxPerEmailIp,
                       @Value("${app.rate-limit.login.window-minutes:15}") long loginWindowMinutes) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogger = auditLogger;
        this.auditContext = auditContext;
        this.rateLimiter = rateLimiter;
        this.refreshTokenService = refreshTokenService;
        this.loginMaxPerEmailIp = loginMaxPerEmailIp;
        this.loginWindowMs = loginWindowMinutes * 60_000L;
    }

    public AuthResponse login(LoginRequest request) {
        String email = request.email().trim().toLowerCase();
        String ip = auditContext.ipAddress();
        // Per-email+IP throttle (the filter already throttles per-IP): limits
        // password guessing against a single account without permanent lockout.
        String emailIpKey = "login:" + email + ":" + ip;
        if (!rateLimiter.tryAcquire(emailIpKey, loginMaxPerEmailIp, loginWindowMs)) {
            auditLogger.loginBlocked(email, ip);
            throw new TooManyRequestsException("Too many login attempts. Please try again later.");
        }
        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.password()));
            // Successful login clears the throttling counter for this email+IP.
            rateLimiter.reset(emailIpKey);
            User user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new ResourceNotFoundException("User not found"));
            auditLogger.loginSuccess(email, ip);
            return refreshTokenService.issue(user);
        } catch (DisabledException e) {
            auditLogger.loginFailure(email, ip, "DISABLED");
            throw new BadCredentialsException("Invalid credentials");
        } catch (LockedException e) {
            auditLogger.loginFailure(email, ip, "LOCKED");
            throw new BadCredentialsException("Invalid credentials");
        } catch (AuthenticationException e) {
            auditLogger.loginFailure(email, ip, "BAD_CREDENTIALS");
            throw e;
        }
    }

    /**
     * Public self-registration. SECURITY: the requested role is never trusted.
     * Every account created through this public endpoint gets the lowest
     * privilege role (USER). Role elevation is only possible through the
     * ADMIN-only endpoint {@code PATCH /users/{id}/role}.
     */
    public AuthResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            auditLogger.loginFailure(email, auditContext.ipAddress(), "REGISTER_DUPLICATE");
            throw new DuplicateResourceException("Email already registered: " + email);
        }
        User user = new User();
        user.setFullName(request.fullName().trim());
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(request.password()));
        // Never accept a role from an unauthenticated client — always USER.
        user.setRole(UserRole.USER);
        userRepository.save(user);
        auditLogger.loginSuccess(email, auditContext.ipAddress());
        return refreshTokenService.issue(user);
    }

    public User getCurrentUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + email));
    }
}
