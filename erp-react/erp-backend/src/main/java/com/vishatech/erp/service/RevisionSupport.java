package com.vishatech.erp.service;

import com.vishatech.erp.exception.BadRequestException;

/**
 * Shared helpers for the document revision chain.
 * <p>
 * Every edit creates a NEW revision row (the previous version is never
 * deleted or overwritten). The original document keeps its plain number
 * (e.g. {@code INV-00001}) and {@code revision == 0}; each edit produces
 * {@code INV-00001(1)}, {@code INV-00001(2)}, ... with the revision number
 * appended in parentheses.
 */
public final class RevisionSupport {

    private RevisionSupport() {
    }

    /**
     * Strips a trailing {@code (N)} suffix from a document number to recover
     * the chain base number. Non-revision numbers are returned unchanged.
     */
    public static String baseNumber(String number) {
        if (number == null || number.isEmpty()) {
            return number;
        }
        int open = number.lastIndexOf('(');
        if (open > 0 && number.endsWith(")")) {
            String inner = number.substring(open + 1, number.length() - 1);
            if (inner.chars().allMatch(Character::isDigit)) {
                return number.substring(0, open);
            }
        }
        return number;
    }

    /** Builds the next revision number, e.g. {@code base + "(3)"}. */
    public static String nextRevisionNumber(String baseNumber, int nextRevision) {
        return baseNumber + "(" + nextRevision + ")";
    }

    /**
     * Enforces historical-revision immutability for every in-place mutation
     * (status changes, approve/reject, archive/restore, delete, ...). Only the
     * latest revision of a chain may be modified; any attempt to mutate an
     * older revision is rejected with a 400, independent of the frontend.
     *
     * @param latest {@code true} when the entity is the chain's latest revision
     *              (entities without a chain always have {@code latestRevision}
     *              set to {@code true})
     */
    public static void requireLatest(boolean latest) {
        if (!latest) {
            throw new BadRequestException(
                    "This document is a historical revision and is read-only. Only the latest revision can be modified.");
        }
    }
}
