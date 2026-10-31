package com.vishatech.erp.dto;

import java.util.List;

/**
 * Shared request records for the CPR module's action endpoints
 * (CPR -> Technical Verification -> Cost Workout -> Profit Workout).
 *
 * These replace the raw {@code Map<String, String>} / {@code Map<String, Long>}
 * request bodies those endpoints previously accepted. Field names mirror the
 * frontend payloads exactly, so request binding and the wire contract are
 * unchanged - the only difference is that an untyped map is no longer handed to
 * the service layer.
 *
 * Deliberately annotation-free: the services already own the validation of
 * these values (unknown status, blank division, non-existent Cost Workout id),
 * and those checks produce the module's existing error responses. Adding bean
 * validation here would change that error path, not the outcome.
 */
public final class CprActionDtos {

    private CprActionDtos() {
    }

    /** Approval remarks for the Cost Workout / Profit Workout approve + reject actions. */
    public record Remarks(String remarks) {
    }

    /** Technical Verification status transition (the workflow's verify/reject step). */
    public record StatusUpdate(String status, String remarks) {
    }

    /** Technical Verification division assignment. */
    public record DivisionUpdate(String division) {
    }

    /** Links a Technical Verification row (or one of its documents) to a Cost Workout. */
    public record CostWorkoutLink(Long costWorkoutId) {
    }

    /** Document visibility change on a Technical Verification document. */
    public record Visibility(String visibility) {
    }

    /** Custom Cost Workout / Profit Workout category list persisted for the grids. */
    public record CustomCategories(List<String> categories) {
    }

    /** Custom Cost Workout / Profit Workout unit list persisted for the grids. */
    public record CustomUnits(List<String> units) {
    }
}
