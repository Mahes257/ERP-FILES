package com.vishatech.erp.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * HTTP 409 Conflict — the request is well-formed and the caller is authorised, but
 * the current state of the data forbids it.
 *
 * <p>Kept distinct from its neighbours so the status means something precise:
 * {@link BadRequestException} is a malformed or invalid request, and
 * {@link DuplicateResourceException} is specifically a duplicate unique value. This
 * one is the state conflict that resolves once the conflicting record is removed —
 * e.g. a Customer Purchase Order that still has a linked Production tracker cannot be
 * permanently deleted, but can be once the tracker is gone.
 *
 * <p>Like {@link ForbiddenException} it carries {@code @ResponseStatus} <em>and</em> an
 * explicit {@code GlobalExceptionHandler} mapping: the advice's catch-all
 * {@code Exception.class} handler takes precedence over {@code @ResponseStatus}, which
 * would otherwise turn this into an opaque 500.
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
