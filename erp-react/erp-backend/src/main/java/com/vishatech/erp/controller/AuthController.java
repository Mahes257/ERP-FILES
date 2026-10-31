package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.AuthResponse;
import com.vishatech.erp.dto.LocalAutoLoginStatus;
import com.vishatech.erp.dto.LoginRequest;
import com.vishatech.erp.dto.RefreshTokenRequest;
import com.vishatech.erp.dto.RegisterRequest;
import com.vishatech.erp.dto.UserResponse;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.service.AuthService;
import com.vishatech.erp.service.LocalAutoLoginService;
import com.vishatech.erp.service.RefreshTokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;
    private final RefreshTokenService refreshTokenService;
    private final LocalAutoLoginService localAutoLoginService;

    public AuthController(AuthService authService,
                          RefreshTokenService refreshTokenService,
                          LocalAutoLoginService localAutoLoginService) {
        this.authService = authService;
        this.refreshTokenService = refreshTokenService;
        this.localAutoLoginService = localAutoLoginService;
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(authService.login(request)));
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(authService.register(request)));
    }

    /** Rotates the refresh token and issues a fresh access token. */
    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(refreshTokenService.rotate(request.refreshToken())));
    }

    /** Revokes the presented refresh token. Safe to call repeatedly. */
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(@Valid @RequestBody RefreshTokenRequest request) {
        refreshTokenService.revoke(request.refreshToken());
        return ResponseEntity.ok(ApiResponse.ok("Logged out"));
    }

    /**
     * Local-development auto-login probe. Answers {@code enabled=true} only when
     * the feature is configured on this server AND the caller is a local,
     * non-proxied request; every other caller sees {@code false}.
     */
    @GetMapping("/local-auto-login/status")
    public ResponseEntity<ApiResponse<LocalAutoLoginStatus>> localAutoLoginStatus(
            HttpServletRequest request) {
        boolean enabled = localAutoLoginService.isEnabled()
                && localAutoLoginService.isEligibleRequest(request);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.ok(new LocalAutoLoginStatus(enabled)));
    }

    /**
     * Local-development auto-login. Issues the same {@link AuthResponse} as
     * {@code /auth/login} — a real signed JWT plus a rotated refresh token — for
     * the configured existing user. Disabled by default and never reachable from
     * outside this machine (see {@link LocalAutoLoginService}).
     */
    @PostMapping("/local-auto-login")
    public ResponseEntity<ApiResponse<AuthResponse>> localAutoLogin(HttpServletRequest request) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.ok(localAutoLoginService.authenticate(request)));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> me(Authentication authentication) {
        User user = authService.getCurrentUser(authentication.getName());
        UserResponse response = new UserResponse(user.getId(), user.getFullName(), user.getEmail(),
                user.getRole().name(), user.isEnabled());
        return ResponseEntity.ok(ApiResponse.ok(response));
    }
}
