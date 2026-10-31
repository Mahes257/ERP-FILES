package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.UserRepository;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.util.Date;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class JwtSecurityTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Autowired
    private UserRepository userRepository;

    private String tokenFor(String email) {
        UserDetails details = userDetailsService.loadUserByUsername(email);
        return jwtService.generateToken(details);
    }

    @Test
    void protectedEndpointWithoutTokenReturns401() throws Exception {
        mockMvc.perform(get("/leads")).andExpect(status().isUnauthorized());
    }

    @Test
    void protectedEndpointWithValidTokenReturns200() throws Exception {
        String token = tokenFor("admin@vishaktech.com");
        mockMvc.perform(get("/leads").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void malformedTokenReturns401() throws Exception {
        mockMvc.perform(get("/leads").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void garbageTokenReturns401() throws Exception {
        mockMvc.perform(get("/leads").header("Authorization", "Bearer a.b.c"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenSignedWithWrongKeyReturns401() throws Exception {
        // Sign a structurally-valid token with a DIFFERENT key.
        SecretKey otherKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(
                "U2VjdXJpdHlUZXN0T25seUtleU5vdEZvclByb2R1Y3Rpb25Vc2VBbm90aGVyU2VjcmV0S2V5MTIzNDU2"));
        String forged = Jwts.builder()
                .subject("admin@vishaktech.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(otherKey)
                .compact();
        mockMvc.perform(get("/leads").header("Authorization", "Bearer " + forged))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void modifiedTokenReturns401() throws Exception {
        String token = tokenFor("admin@vishaktech.com");
        // Flip one character in the signature part.
        String[] parts = token.split("\\.");
        String sig = parts[2];
        char c = sig.charAt(0) == 'a' ? 'b' : 'a';
        String tampered = parts[0] + "." + parts[1] + "." + c + sig.substring(1);
        assertThat(tampered).isNotEqualTo(token);
        mockMvc.perform(get("/leads").header("Authorization", "Bearer " + tampered))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void disabledUserTokenIsRejected() throws Exception {
        User user = userRepository.findByEmail("kavya@vishaktech.com").orElseThrow();
        String token = tokenFor(user.getEmail());
        // Token is valid now.
        mockMvc.perform(get("/leads").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // Disable the account — the still-valid token must stop working.
        user.setEnabled(false);
        userRepository.save(user);
        try {
            mockMvc.perform(get("/leads").header("Authorization", "Bearer " + token))
                    .andExpect(status().isUnauthorized());
        } finally {
            user.setEnabled(true);
            userRepository.save(user);
        }
    }

    @Test
    void lockedUserTokenIsRejected() throws Exception {
        User user = userRepository.findByEmail("raghav@vishaktech.com").orElseThrow();
        String token = tokenFor(user.getEmail());
        user.setLocked(true);
        userRepository.save(user);
        try {
            mockMvc.perform(get("/leads").header("Authorization", "Bearer " + token))
                    .andExpect(status().isUnauthorized());
        } finally {
            user.setLocked(false);
            userRepository.save(user);
        }
    }

    @Test
    void unknownUserTokenIsRejected() throws Exception {
        // Token for a user that does not exist in the DB.
        User ghost = new User();
        ghost.setEmail("ghost@nowhere.example");
        ghost.setFullName("Ghost");
        ghost.setRole(UserRole.USER);
        ghost.setPassword("$2a$10$not.used");
        // Build token via a real UserDetails-like principal without saving.
        String token = jwtService.generateToken(
                new org.springframework.security.core.userdetails.User(
                        "ghost@nowhere.example", "x", true, true, true, true, java.util.List.of()));
        mockMvc.perform(get("/leads").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }
}
