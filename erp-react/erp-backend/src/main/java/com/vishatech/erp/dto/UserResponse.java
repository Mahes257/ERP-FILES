package com.vishatech.erp.dto;

public record UserResponse(
        Long id,
        String name,
        String email,
        String role,
        boolean enabled
) {
}
