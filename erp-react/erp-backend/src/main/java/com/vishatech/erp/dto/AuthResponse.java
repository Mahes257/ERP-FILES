package com.vishatech.erp.dto;

public record AuthResponse(
        String token,
        String type,
        String email,
        String fullName,
        String role,
        String refreshToken
) {
}
