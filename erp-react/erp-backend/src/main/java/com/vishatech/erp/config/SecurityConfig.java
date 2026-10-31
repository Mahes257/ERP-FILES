package com.vishatech.erp.config;

import com.vishatech.erp.security.AuthRateLimitFilter;
import com.vishatech.erp.security.JwtAuthenticationFilter;
import com.vishatech.erp.security.RestAccessDeniedHandler;
import com.vishatech.erp.security.RestAuthenticationEntryPoint;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final AuthRateLimitFilter authRateLimitFilter;
    private final UserDetailsService userDetailsService;
    private final RestAuthenticationEntryPoint authenticationEntryPoint;
    private final RestAccessDeniedHandler accessDeniedHandler;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          AuthRateLimitFilter authRateLimitFilter,
                          UserDetailsService userDetailsService,
                          RestAuthenticationEntryPoint authenticationEntryPoint,
                          RestAccessDeniedHandler accessDeniedHandler) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.authRateLimitFilter = authRateLimitFilter;
        this.userDetailsService = userDetailsService;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   @Value("${app.security.hsts:false}") boolean hstsEnabled,
                                                   @Value("${app.security.hsts-max-age:31536000}") long hstsMaxAge,
                                                   @Value("${app.cors.allowed-origins:}") String allowedOrigins)
            throws Exception {
        http
            // CSRF: disabled deliberately. Authentication is a JWT carried in
            // the Authorization header (stateless, no cookies), so there is no
            // ambient credential a cross-site request could abuse. See
            // SECURITY_AUDIT.md §12. If cookie-based auth is adopted later,
            // CSRF protection must be re-enabled.
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource(allowedOrigins)))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Public: authentication endpoints + health.
                .requestMatchers("/auth/login", "/auth/register", "/auth/refresh", "/auth/logout",
                        "/health", "/error").permitAll()

                // Local-development auto-login. Public so it can be reached
                // before a session exists, but the handler itself refuses to
                // run unless the feature is explicitly enabled AND the caller
                // is a non-proxied loopback request (see LocalAutoLoginService).
                // Every other request below still requires authentication.
                .requestMatchers("/auth/local-auto-login", "/auth/local-auto-login/status").permitAll()

                // Actuator: health, info, and Prometheus metrics are public.
                // Only the liveness/readiness surface is public. Prometheus and
                // metrics expose JVM, pool and endpoint internals, so they stay
                // behind authentication — scrape them with an ERP service
                // account, never anonymously.
                .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                .requestMatchers("/actuator/**").authenticated()

                // WebSocket handshake must be reachable before authentication.
                // STOMP frames carry the JWT via the Authorization header.
                .requestMatchers("/ws/**").permitAll()

                // NOTE: /files/** is intentionally NOT public anymore — file
                // access requires an authenticated user.
                .anyRequest().authenticated())
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(authenticationEntryPoint)
                .accessDeniedHandler(accessDeniedHandler))
            .headers(headers -> headers
                .contentSecurityPolicy(csp -> csp.policyDirectives(
                        "default-src 'self'; "
                        + "script-src 'self'; "
                        + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                        + "img-src 'self' data: blob:; "
                        + "font-src 'self' data: https://fonts.gstatic.com; "
                        + "connect-src 'self'; "
                        + "object-src 'none'; "
                        + "base-uri 'self'; "
                        + "frame-ancestors 'none'; "
                        + "form-action 'self'"))
                .referrerPolicy(referrer -> referrer.policy(
                        org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                .frameOptions(frame -> frame.deny())
                .httpStrictTransportSecurity(hsts -> {
                    // The header is only written for secure (HTTPS) requests.
                    hsts.includeSubDomains(true).maxAgeInSeconds(hstsMaxAge);
                    if (!hstsEnabled) {
                        hsts.requestMatcher(request -> false);
                    }
                }))
            .authenticationProvider(authenticationProvider())
            // Rate limiter runs first (public auth endpoints), then the JWT
            // filter, both before the username/password filter position.
            .addFilterBefore(authRateLimitFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * CORS from configuration (app.cors.allowed-origins, comma-separated).
     * No wildcard patterns with credentials. When the frontend is served
     * same-origin through the Vite/nginx proxy (the default deployment),
     * no CORS configuration is needed at all.
     */
    public CorsConfigurationSource corsConfigurationSource(String allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();

        List<String> origins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .toList();

        if (!origins.isEmpty()) {
            config.setAllowedOrigins(origins);
        }

        config.setAllowedMethods(List.of(
                "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));

        // Purchase actions include the authenticated actor metadata used by
        // the shared audit/timeline infrastructure. These headers must be
        // allowed during browser preflight when the UI is hosted separately.
        config.setAllowedHeaders(List.of(
                "Authorization", "Content-Type",
                "X-Actor-Id", "X-Actor-Name", "X-Actor-Role"));

        config.setAllowCredentials(true);
        config.setExposedHeaders(List.of("Content-Disposition"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return source;
    }
}

// Before using Prometheus Code
// package com.vishatech.erp.config;

// import com.vishatech.erp.security.AuthRateLimitFilter;
// import com.vishatech.erp.security.JwtAuthenticationFilter;
// import com.vishatech.erp.security.RestAccessDeniedHandler;
// import com.vishatech.erp.security.RestAuthenticationEntryPoint;
// import java.util.Arrays;
// import java.util.List;
// import org.springframework.beans.factory.annotation.Value;
// import org.springframework.context.annotation.Bean;
// import org.springframework.context.annotation.Configuration;
// import org.springframework.security.authentication.AuthenticationManager;
// import org.springframework.security.authentication.AuthenticationProvider;
// import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
// import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
// import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
// import org.springframework.security.config.annotation.web.builders.HttpSecurity;
// import org.springframework.security.config.http.SessionCreationPolicy;
// import org.springframework.security.core.userdetails.UserDetailsService;
// import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
// import org.springframework.security.crypto.password.PasswordEncoder;
// import org.springframework.security.web.SecurityFilterChain;
// import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
// import org.springframework.web.cors.CorsConfiguration;
// import org.springframework.web.cors.CorsConfigurationSource;
// import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

// @Configuration
// @EnableMethodSecurity
// public class SecurityConfig {

//     private final JwtAuthenticationFilter jwtAuthenticationFilter;
//     private final AuthRateLimitFilter authRateLimitFilter;
//     private final UserDetailsService userDetailsService;
//     private final RestAuthenticationEntryPoint authenticationEntryPoint;
//     private final RestAccessDeniedHandler accessDeniedHandler;

//     public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
//                           AuthRateLimitFilter authRateLimitFilter,
//                           UserDetailsService userDetailsService,
//                           RestAuthenticationEntryPoint authenticationEntryPoint,
//                           RestAccessDeniedHandler accessDeniedHandler) {
//         this.jwtAuthenticationFilter = jwtAuthenticationFilter;
//         this.authRateLimitFilter = authRateLimitFilter;
//         this.userDetailsService = userDetailsService;
//         this.authenticationEntryPoint = authenticationEntryPoint;
//         this.accessDeniedHandler = accessDeniedHandler;
//     }

//     @Bean
//     public SecurityFilterChain securityFilterChain(HttpSecurity http,
//                                                    @Value("${app.security.hsts:false}") boolean hstsEnabled,
//                                                    @Value("${app.security.hsts-max-age:31536000}") long hstsMaxAge,
//                                                    @Value("${app.cors.allowed-origins:}") String allowedOrigins)
//             throws Exception {
//         http
//             // CSRF: disabled deliberately. Authentication is a JWT carried in
//             // the Authorization header (stateless, no cookies), so there is no
//             // ambient credential a cross-site request could abuse. See
//             // SECURITY_AUDIT.md §12. If cookie-based auth is adopted later,
//             // CSRF protection must be re-enabled.
//             .csrf(csrf -> csrf.disable())
//             .cors(cors -> cors.configurationSource(corsConfigurationSource(allowedOrigins)))
//             .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
//             .authorizeHttpRequests(auth -> auth
//                 // Public: authentication endpoints + health.
//                 .requestMatchers("/auth/login", "/auth/register", "/auth/refresh", "/auth/logout",
//                         "/health", "/error").permitAll()
//                 // Actuator: health + info are public; all other actuator endpoints require auth.
//                 .requestMatchers("/actuator/health", "/actuator/info").permitAll()
//                 .requestMatchers("/actuator/**").authenticated()
//                 // WebSocket handshake must be reachable before authentication.
//                 // STOMP frames carry the JWT via the Authorization header.
//                 .requestMatchers("/ws/**").permitAll()
//                 // NOTE: /files/** is intentionally NOT public anymore — file
//                 // access requires an authenticated user.
//                 .anyRequest().authenticated())
//             .exceptionHandling(ex -> ex
//                 .authenticationEntryPoint(authenticationEntryPoint)
//                 .accessDeniedHandler(accessDeniedHandler))
//             .headers(headers -> headers
//                 .contentSecurityPolicy(csp -> csp.policyDirectives(
//                         "default-src 'self'; "
//                         + "script-src 'self'; "
//                         + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
//                         + "img-src 'self' data: blob:; "
//                         + "font-src 'self' data: https://fonts.gstatic.com; "
//                         + "connect-src 'self'; "
//                         + "object-src 'none'; "
//                         + "base-uri 'self'; "
//                         + "frame-ancestors 'none'; "
//                         + "form-action 'self'"))
//                 .referrerPolicy(referrer -> referrer.policy(
//                         org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
//                 .frameOptions(frame -> frame.deny())
//                 .httpStrictTransportSecurity(hsts -> {
//                     // The header is only written for secure (HTTPS) requests.
//                     hsts.includeSubDomains(true).maxAgeInSeconds(hstsMaxAge);
//                     if (!hstsEnabled) {
//                         hsts.requestMatcher(request -> false);
//                     }
//                 }))
//             .authenticationProvider(authenticationProvider())
//             // Rate limiter runs first (public auth endpoints), then the JWT
//             // filter, both before the username/password filter position.
//             .addFilterBefore(authRateLimitFilter, UsernamePasswordAuthenticationFilter.class)
//             .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
//         return http.build();
//     }

//     @Bean
//     public AuthenticationProvider authenticationProvider() {
//         DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
//         provider.setUserDetailsService(userDetailsService);
//         provider.setPasswordEncoder(passwordEncoder());
//         return provider;
//     }

//     @Bean
//     public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
//         return config.getAuthenticationManager();
//     }

//     @Bean
//     public PasswordEncoder passwordEncoder() {
//         return new BCryptPasswordEncoder();
//     }

//     /**
//      * CORS from configuration (app.cors.allowed-origins, comma-separated).
//      * No wildcard patterns with credentials. When the frontend is served
//      * same-origin through the Vite/nginx proxy (the default deployment),
//      * no CORS configuration is needed at all.
//      */
//     public CorsConfigurationSource corsConfigurationSource(String allowedOrigins) {
//         CorsConfiguration config = new CorsConfiguration();
//         List<String> origins = Arrays.stream(allowedOrigins.split(","))
//                 .map(String::trim)
//                 .filter(s -> !s.isBlank())
//                 .toList();

//         if (!origins.isEmpty()) {
//             config.setAllowedOrigins(origins);
//         }

//         config.setAllowedMethods(List.of(
//                 "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));

//         // Purchase actions include the authenticated actor metadata used by
//         // the shared audit/timeline infrastructure. These headers must be
//         // allowed during browser preflight when the UI is hosted separately.
//         config.setAllowedHeaders(List.of(
//                 "Authorization", "Content-Type",
//                 "X-Actor-Id", "X-Actor-Name", "X-Actor-Role"));

//         config.setAllowCredentials(true);
//         config.setExposedHeaders(List.of("Content-Disposition"));

//         UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
//         source.registerCorsConfiguration("/**", config);

//         return source;
//     }
// }