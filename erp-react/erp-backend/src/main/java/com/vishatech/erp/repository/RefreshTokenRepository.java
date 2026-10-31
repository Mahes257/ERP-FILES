package com.vishatech.erp.repository;

import com.vishatech.erp.entity.RefreshToken;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    List<RefreshToken> findByFamilyId(String familyId);

    List<RefreshToken> findByUserId(Long userId);

    /**
     * Token retention cleanup.
     *
     * TRANSACTION: these are DERIVED delete queries, and Spring Data JPA only
     * applies a transaction to the CRUD methods it implements itself — a derived
     * {@code deleteBy...} runs bare. {@link com.vishatech.erp.service.RefreshTokenService}
     * is deliberately NOT transactional (each repository call must commit on its
     * own so reuse-detection revocations survive a later BadCredentialsException),
     * so without these annotations the delete failed with
     * {@code InvalidDataAccessApiUsageException: No EntityManager with actual
     * transaction available for current thread} — returning HTTP 500 from
     * /auth/login and /auth/register as soon as a 30-day-old token existed to
     * remove. Annotating here keeps that per-call commit contract intact: the
     * transaction starts and commits inside the repository call.
     */
    @Transactional
    long deleteByExpiresAtBefore(java.time.Instant cutoff);

    @Transactional
    long deleteByRevokedAtBefore(java.time.Instant cutoff);
}
