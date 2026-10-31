package com.vishatech.erp.exception;

/**
 * The upload volume does not have enough free space to accept a new write.
 *
 * <p>Mapped to HTTP 507 so the caller can distinguish a capacity problem from a
 * validation error (400) or an over-limit batch (413), and so monitoring can
 * alert on it without parsing the message.
 */
public class InsufficientStorageException extends RuntimeException {

    public InsufficientStorageException(String message) {
        super(message);
    }
}
