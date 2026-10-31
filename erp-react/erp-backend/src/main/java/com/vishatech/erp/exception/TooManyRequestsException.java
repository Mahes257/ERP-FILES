package com.vishatech.erp.exception;

/** Mapped to HTTP 429 Too Many Requests (rate limiting). */
public class TooManyRequestsException extends RuntimeException {

    public TooManyRequestsException(String message) {
        super(message);
    }
}
