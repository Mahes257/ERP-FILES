package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.ChangeRoleRequest;
import com.vishatech.erp.dto.UserResponse;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.security.SecurityAuditLogger;
import com.vishatech.erp.util.AuditContext;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users")
@PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
public class UserController {

    private final UserRepository userRepository;
    private final SecurityAuditLogger auditLogger;
    private final AuditContext auditContext;

    public UserController(UserRepository userRepository,
                          SecurityAuditLogger auditLogger,
                          AuditContext auditContext) {
        this.userRepository = userRepository;
        this.auditLogger = auditLogger;
        this.auditContext = auditContext;
    }

    @GetMapping
    public ResponseEntity<List<UserResponse>> list() {
        List<UserResponse> users = userRepository.findAll(Sort.by("fullName")).stream()
                .map(this::toResponse)
                .toList();
        return ResponseEntity.ok(users);
    }

    /**
     * ADMIN-only role change. This is the ONLY way a user's role can be
     * elevated — public registration always creates USER accounts and never
     * trusts a role from the client.
     */
    @PatchMapping("/{id}/role")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> changeRole(@PathVariable Long id,
                                                                @Valid @RequestBody ChangeRoleRequest request,
                                                                Authentication authentication) {
        User target = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + id));
        UserRole newRole;
        try {
            newRole = UserRole.valueOf(request.role().trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid role: " + request.role() + " (allowed: ADMIN, MANAGER, USER)");
        }

        String actorEmail = authentication != null ? authentication.getName() : "unknown";
        // Never allow an admin to change their own role (prevents accidental
        // self-demotion that could lock the system out of ADMIN management).
        if (target.getEmail().equalsIgnoreCase(actorEmail)) {
            throw new BadRequestException("You cannot change your own role");
        }

        String previous = target.getRole().name();
        target.setRole(newRole);
        User saved = userRepository.save(target);
        auditLogger.roleChanged(actorEmail, saved.getEmail(), previous, newRole.name(), auditContext.ipAddress());
        return ResponseEntity.ok(ApiResponse.ok(toResponse(saved)));
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(user.getId(), user.getFullName(), user.getEmail(), user.getRole().name(),
                user.isEnabled());
    }
}
