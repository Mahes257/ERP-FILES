package com.vishatech.erp.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP WebSocket configuration for real-time notifications.
 *
 * Endpoints:
 *   /ws          — STOMP handshake (SockJS fallback for older browsers)
 *   /user/queue/notifications — per-user notification destination
 *
 * Security: the STOMP handshake endpoint (/ws) is added to SecurityConfig's
 * permitAll list so the HTTP upgrade succeeds; the actual user authentication
 * happens on STOMP CONNECT via {@link StompJwtInterceptor}, which validates
 * the JWT from the Authorization header and places an authenticated Principal
 * into the STOMP session.  This prevents anonymous subscriptions to arbitrary
 * /user/{id}/queue/notifications destinations.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompJwtInterceptor stompJwtInterceptor;

    public WebSocketConfig(StompJwtInterceptor stompJwtInterceptor) {
        this.stompJwtInterceptor = stompJwtInterceptor;
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(stompJwtInterceptor);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // In-memory broker for user-targeted messages (no external broker needed).
        config.enableSimpleBroker("/queue", "/topic");
        // Clients send to /app/...
        config.setApplicationDestinationPrefixes("/app");
        // User destinations: /user/{userId}/queue/notifications
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }
}
