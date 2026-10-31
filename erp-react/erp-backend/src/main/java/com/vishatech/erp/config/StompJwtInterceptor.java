package com.vishatech.erp.config;

import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.security.JwtService;
import java.security.Principal;
import java.util.Objects;
import java.util.logging.Logger;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;

/**
 * Validates the JWT carried in STOMP CONNECT frame headers and establishes the
 * session's user identity.
 *
 * The WebSocket handshake (/ws) is permitAll so the HTTP upgrade can
 * succeed, but STOMP CONNECT frames must carry a valid JWT in the
 * "Authorization: Bearer xxx" header.  This interceptor extracts the
 * token, validates it via {@link JwtService}, loads the UserDetails, and
 * places an authenticated Principal into the STOMP session.
 *
 * <h2>Identity contract (the single source of truth)</h2>
 *
 * Spring resolves a {@code /user/**} destination from the <b>session principal
 * name</b>, so that name must be exactly the identity the push sites target.
 * Every notification push in this ERP addresses the recipient by the ERP user
 * id — {@code convertAndSendToUser(String.valueOf(userId), "/queue/notifications", …)}
 * in {@code NotificationService}, and the same form in
 * {@code PurchaseSupportService} — so this interceptor names the STOMP
 * principal with the <b>user id</b>.
 *
 * Before this, the principal was the Spring Security authentication whose name
 * is the user's <em>email</em>: a CONNECT by admin@vishaktech.com created the
 * session "admin@vishaktech.com", while the push went to "/user/1/…", which
 * Spring could never resolve to that session. REST notification creation still
 * worked (records were stored), the client still showed "Live", and every
 * realtime push was silently dropped. Naming the principal with the user id
 * makes the whole chain — CONNECT → session principal → /user destination →
 * push recipient → browser subscription — use one identity, without touching
 * the notification business logic or the push call sites.
 *
 * The email is kept for logging/audit and is available on
 * {@link StompUserPrincipal#email()}; it is deliberately NOT the session name.
 *
 * SECURITY: without this interceptor, ANY anonymous browser could
 * subscribe to /user/{id}/queue/notifications for arbitrary ids. The
 * principal is derived server-side from the signed JWT — never from
 * client-supplied data — and an unknown user fails the CONNECT.
 */
@Component
public class StompJwtInterceptor implements ChannelInterceptor {

    private static final Logger log = Logger.getLogger(StompJwtInterceptor.class.getName());

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;
    private final UserRepository userRepository;

    public StompJwtInterceptor(JwtService jwtService,
                               UserDetailsService userDetailsService,
                               UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
        this.userRepository = userRepository;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                log.warning("STOMP CONNECT rejected: missing or malformed Authorization header");
                throw new SecurityException("STOMP CONNECT requires a valid JWT token");
            }

            String token = authHeader.substring(7);
            try {
                String username = jwtService.extractUsername(token);
                UserDetails userDetails = userDetailsService.loadUserByUsername(username);

                if (!jwtService.isValid(token, userDetails)) {
                    log.warning("STOMP CONNECT rejected: invalid JWT for user=" + username);
                    throw new SecurityException("Invalid JWT token for STOMP CONNECT");
                }

                // The identity used by every convertAndSendToUser(userId, …) push.
                Long userId = userRepository.findByEmail(username)
                        .map(com.vishatech.erp.entity.User::getId)
                        .orElseThrow(() -> new SecurityException(
                                "STOMP CONNECT rejected: unknown user " + username));

                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                new StompUserPrincipal(userId, username),
                                null,
                                userDetails.getAuthorities());
                accessor.setUser(authentication);

                log.info("STOMP CONNECT authenticated user=" + username
                        + " (principal=" + userId + ")");
            } catch (SecurityException e) {
                throw e;
            } catch (Exception e) {
                log.warning("STOMP CONNECT rejected: " + e.getMessage());
                throw new SecurityException("JWT validation failed for STOMP CONNECT");
            }
        }

        return message;
    }

    /**
     * STOMP session principal.
     *
     * <p>{@link #getName()} is the ERP user id — the exact value the backend
     * passes to {@code convertAndSendToUser(userId, …)}, so Spring's user
     * destination resolver can route {@code /user/{id}/queue/**} to this
     * session. The email is retained for logging and diagnostics only.
     */
    public static final class StompUserPrincipal implements Principal {

        private final Long userId;
        private final String email;

        public StompUserPrincipal(Long userId, String email) {
            this.userId = userId;
            this.email = email;
        }

        /** The routing identity: the ERP user id, as a string. */
        @Override
        public String getName() {
            return String.valueOf(userId);
        }

        public Long userId() {
            return userId;
        }

        public String email() {
            return email;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof StompUserPrincipal that)) {
                return false;
            }
            return Objects.equals(userId, that.userId) && Objects.equals(email, that.email);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, email);
        }

        @Override
        public String toString() {
            return "StompUserPrincipal[userId=" + userId + ", email=" + email + "]";
        }
    }
}
