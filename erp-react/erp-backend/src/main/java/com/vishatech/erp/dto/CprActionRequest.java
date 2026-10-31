package com.vishatech.erp.dto;

/**
 * Body for the CPR action endpoints (approve / reject / send-back …).
 *
 * @param remarks     approval or rejection remarks, stored on the CPR
 * @param destination the Admin's float destination — {@code PR} or {@code CW}.
 *                    Required when the CPR's Technical Verification is complete
 *                    (the verification is the gate, the Admin picks the target);
 *                    must be empty when it is not, so a destination is never
 *                    assumed. Optional in the record only so reject / send-back
 *                    can reuse the same body.
 */
public record CprActionRequest(
        String remarks,
        String destination
) {
}
