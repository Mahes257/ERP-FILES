package com.vishatech.erp.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.config.StompJwtInterceptor.StompUserPrincipal;
import com.vishatech.erp.dto.NotificationRequest;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.security.JwtService;
import com.vishatech.erp.service.NotificationService;
import com.vishatech.erp.util.AuditContext;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

/**
 * Focused tests for the single identity contract that realtime notification
 * delivery depends on:
 *
 * <pre>
 * authenticated user ──► STOMP session principal ──► Spring /user destination
 *        ▲                                                  │
 *        └────────── convertAndSendToUser(recipientId, …) ◄─┘
 * </pre>
 *
 * Both sides must name the recipient with the same value — the ERP user id —
 * and the push destination must carry the {@code /queue} prefix that the
 * client's {@code /user/queue/notifications} subscription and the simple
 * broker's configured prefixes both resolve to. Nothing here hardcodes a
 * particular user id or email: each test derives its expectation from the
 * user it constructs.
 */
@ExtendWith(MockitoExtension.class)
class StompIdentityTests {

    @Mock private JwtService jwtService;
    @Mock private UserDetailsService userDetailsService;
    @Mock private UserRepository userRepository;
    @Mock private NotificationRepository notificationRepo;
    @Mock private AuditContext auditContext;
    @Mock private SimpMessagingTemplate wsTemplate;

    private StompJwtInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new StompJwtInterceptor(jwtService, userDetailsService, userRepository);
    }

    // ---- helpers ----

    /** Builds a STOMP CONNECT frame the way Spring does when parsing a wire frame. */
    private static Message<?> connectFrame(String authorizationHeader) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setLeaveMutable(true);
        if (authorizationHeader != null) {
            accessor.addNativeHeader("Authorization", authorizationHeader);
        }
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    /** Stubs a valid JWT for the given user and returns the CONNECT frame. */
    private Message<?> authenticatedConnect(User user) {
        // Read the email before entering a when(...) block: invoking another
        // mock inside .thenReturn(...) trips Mockito's unfinished-stubbing check.
        String email = user.getEmail();
        UserDetails details = mock(UserDetails.class);
        when(jwtService.extractUsername("valid-token")).thenReturn(email);
        when(userDetailsService.loadUserByUsername(email)).thenReturn(details);
        when(jwtService.isValid("valid-token", details)).thenReturn(true);
        when(userRepository.findByEmail(email)).thenReturn(Optional.of(user));
        return connectFrame("Bearer valid-token");
    }

    private static User user(long id, String email) {
        User u = mock(User.class);
        lenient().when(u.getId()).thenReturn(id);
        lenient().when(u.getEmail()).thenReturn(email);
        return u;
    }

    private NotificationService notificationService() {
        lenient().when(auditContext.currentUserId()).thenReturn(1L);
        lenient().when(notificationRepo.save(any(Notification.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        return new NotificationService(notificationRepo, auditContext, wsTemplate, 200, 100, 500);
    }

    private NotificationRequest requestFor(long recipientId) {
        return new NotificationRequest(
                recipientId, "Probe title", "Probe message", "GENERAL",
                null, null, Notification.Priority.NORMAL, null, true, 0, null);
    }

    // ---- 1. identity mapping ----

    @Test
    void connectNamesSessionPrincipalWithTheUserIdThatPushSitesUse() {
        User alice = user(77L, "alice@example.com");

        Message<?> result = interceptor.preSend(authenticatedConnect(alice), null);

        StompHeaderAccessor accessor =
                StompHeaderAccessor.getAccessor(result, StompHeaderAccessor.class);
        assertThat(accessor).isNotNull();
        assertThat(accessor.getUser()).isNotNull();
        // Spring resolves /user/** from Principal.getName(): it must be the id.
        assertThat(accessor.getUser().getName()).isEqualTo("77");
        Authentication auth = (Authentication) accessor.getUser();
        StompUserPrincipal principal = (StompUserPrincipal) auth.getPrincipal();
        assertThat(principal.userId()).isEqualTo(77L);
        assertThat(principal.email()).isEqualTo("alice@example.com");
    }

    @Test
    void identityMappingIsDynamicPerUserNotHardcoded() {
        Message<?> first = interceptor.preSend(
                authenticatedConnect(user(1L, "admin@vishaktech.com")), null);
        Message<?> second = interceptor.preSend(
                authenticatedConnect(user(4L, "divya@example.com")), null);

        assertThat(StompHeaderAccessor.getAccessor(first, StompHeaderAccessor.class)
                .getUser().getName()).isEqualTo("1");
        assertThat(StompHeaderAccessor.getAccessor(second, StompHeaderAccessor.class)
                .getUser().getName()).isEqualTo("4");
    }

    @Test
    void principalNameEqualsTheRecipientArgumentPassedToThePushSite() {
        long recipientId = 7L;
        User sender = user(recipientId, "someone@example.com");

        Message<?> result = interceptor.preSend(authenticatedConnect(sender), null);
        String principalName = StompHeaderAccessor.getAccessor(result, StompHeaderAccessor.class)
                .getUser().getName();

        notificationService().create(requestFor(recipientId));

        ArgumentCaptor<String> dest = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(wsTemplate).convertAndSendToUser(user.capture(), dest.capture(), any());
        // Same identity on both ends of the chain.
        assertThat(user.getValue()).isEqualTo(principalName);
    }

    // ---- 2. authentication is preserved ----

    @Test
    void connectWithoutAuthorizationHeaderIsRejected() {
        assertThatThrownBy(() -> interceptor.preSend(connectFrame(null), null))
                .isInstanceOf(SecurityException.class)
                .hasMessageContaining("valid JWT token");
    }

    @Test
    void connectWithInvalidJwtIsRejected() {
        UserDetails details = mock(UserDetails.class);
        when(jwtService.extractUsername("bad-token")).thenReturn("someone@example.com");
        when(userDetailsService.loadUserByUsername("someone@example.com")).thenReturn(details);
        when(jwtService.isValid("bad-token", details)).thenReturn(false);

        assertThatThrownBy(() ->
                interceptor.preSend(connectFrame("Bearer bad-token"), null))
                .isInstanceOf(SecurityException.class)
                .hasMessageContaining("Invalid JWT");
    }

    @Test
    void connectForUnknownUserIsRejected() {
        UserDetails details = mock(UserDetails.class);
        when(jwtService.extractUsername("ghost@example.com")).thenReturn("ghost@example.com");
        when(userDetailsService.loadUserByUsername("ghost@example.com")).thenReturn(details);
        when(jwtService.isValid("ghost@example.com", details)).thenReturn(true);
        when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() ->
                interceptor.preSend(connectFrame("Bearer ghost-token"), null))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void framesOtherThanConnectAreLeftUntouched() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setLeaveMutable(true);
        accessor.addNativeHeader("destination", "/user/queue/notifications");
        Message<?> subscribe =
                MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        Message<?> result = interceptor.preSend(subscribe, null);

        assertThat(result).isSameAs(subscribe);
        StompHeaderAccessor out =
                StompHeaderAccessor.getAccessor(result, StompHeaderAccessor.class);
        assertThat(out.getUser()).isNull();
    }

    // ---- 3. user-destination form the client/broker can route ----

    @Test
    void notificationPushUsesTheBrokerPrefixedUserDestination() {
        notificationService().create(requestFor(3L));

        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> dest = ArgumentCaptor.forClass(String.class);
        verify(wsTemplate, times(1)).convertAndSendToUser(user.capture(), dest.capture(), any());

        // convertAndSendToUser(user, dest) targets /user/{user}{dest}; the client
        // subscribes to /user/queue/notifications and the broker only routes
        // /queue + /topic, so dest must be exactly /queue/notifications.
        assertThat(user.getValue()).isEqualTo("3");
        assertThat(dest.getValue()).isEqualTo("/queue/notifications");
        assertThat(dest.getValue()).startsWith("/queue/");
    }

    // ---- 4. wrong-user isolation at the push site ----

    @Test
    void pushIsAddressedOnlyToTheRequestedRecipient() {
        notificationService().create(requestFor(7L));

        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(wsTemplate, times(1)).convertAndSendToUser(user.capture(), any(), any());
        assertThat(user.getValue()).isEqualTo("7");
        verify(wsTemplate, never()).convertAndSendToUser(eq("8"), any(), any());
    }
}
