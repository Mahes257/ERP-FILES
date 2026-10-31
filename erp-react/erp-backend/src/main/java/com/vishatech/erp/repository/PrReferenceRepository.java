package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PrReference;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Directly-created Reference PR No rows.
 *
 * Case-insensitive matching is expressed with explicit JPQL {@code lower(...)}
 * on a VARCHAR column — deliberately NOT the derived {@code ...IgnoreCase}
 * keyword, which Hibernate cannot render against TEXT/CLOB mappings.
 */
public interface PrReferenceRepository extends JpaRepository<PrReference, Long> {

    @Query("SELECT p FROM PrReference p WHERE lower(p.referencePrNo) = lower(:ref) ORDER BY p.id ASC")
    List<PrReference> findAllByReferencePrNoIgnoreCase(@Param("ref") String ref);

    default Optional<PrReference> findByReferencePrNoIgnoreCase(String ref) {
        if (ref == null || ref.isBlank()) {
            return Optional.empty();
        }
        return findAllByReferencePrNoIgnoreCase(ref.trim()).stream().findFirst();
    }

    /** Autocomplete over directly-created PR numbers (LIKE %q%, capped by caller). */
    @Query("SELECT p FROM PrReference p WHERE p.referencePrNo IS NOT NULL AND p.referencePrNo <> '' "
            + "AND lower(p.referencePrNo) LIKE lower(concat('%', :q, '%')) ORDER BY p.referencePrNo ASC")
    List<PrReference> searchByReferencePrNo(@Param("q") String q);

    @Query("SELECT p FROM PrReference p WHERE p.cprId = :cprId")
    List<PrReference> findByCprId(@Param("cprId") Long cprId);
}
