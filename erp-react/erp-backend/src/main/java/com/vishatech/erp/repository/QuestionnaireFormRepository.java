package com.vishatech.erp.repository;

import com.vishatech.erp.entity.QuestionnaireForm;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface QuestionnaireFormRepository extends JpaRepository<QuestionnaireForm, Long>,
        JpaSpecificationExecutor<QuestionnaireForm> {

    /**
     * One Q Form per visit — fetch the existing one (or null).
     * Uses findFirst because legacy standalone rows may share a visit_id
     * with a real visit (standalone used userId as a NOT NULL fallback).
     */
    Optional<QuestionnaireForm> findFirstByVisitIdOrderByIdDesc(Long visitId);

    /** All forms that claim this visit_id (legacy multi-row safe lookup). */
    List<QuestionnaireForm> findByVisitIdOrderByIdAsc(Long visitId);

    /** All Q Forms for a specific marketer (ownership scoping). */
    List<QuestionnaireForm> findByMarketerUserIdOrderByCreatedAtDesc(Long marketerUserId);

    /** All Q Forms. */
    List<QuestionnaireForm> findAllByOrderByCreatedAtDesc();

    long count();
    long countByStatus(String status);
    long countByDeletedFalse();
    long countByDeletedFalseAndStatus(String status);
    List<QuestionnaireForm> findByDateOfVisitBetween(java.time.LocalDate start, java.time.LocalDate end);
}
