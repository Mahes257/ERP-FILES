package com.vishatech.erp.security;

import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.UserRepository;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * TEST SCOPE ONLY — creates the three accounts the backend suite signs in with.
 *
 * <p>The suite authenticates as {@code admin@vishaktech.com} (an ADMIN, for the
 * admin-only paths) and uses {@code kavya@vishaktech.com} /
 * {@code raghav@vishaktech.com} as ordinary USERs for role, lock and
 * disabled-account checks. Those rows used to arrive from the production demo
 * seeder that has since been removed, so the fixture now lives here, in
 * {@code src/test}:
 *
 * <ul>
 *   <li>it is never scanned into a deployed application — test classes are not
 *       on the runtime classpath;</li>
 *   <li>it runs as an {@link ApplicationRunner}, i.e. during context startup,
 *       so it is in place before any {@code @BeforeAll} that mints a token;</li>
 *   <li>each account is created only when it does not already exist, so cached
 *       contexts sharing the H2 database never duplicate or reset a user.</li>
 * </ul>
 *
 * <p>No production account, role or password is invented: this is the same
 * seed data the tests were already asserting against.
 */
@Component
public class TestAccountBootstrap implements ApplicationRunner {

    /** Password the suite's login tests send for the seeded accounts. */
    private static final String TEST_PASSWORD = "Admin@123";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public TestAccountBootstrap(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        ensureUser("admin@vishaktech.com", "Admin User", UserRole.ADMIN);
        ensureUser("kavya@vishaktech.com", "Kavya Krishnan", UserRole.USER);
        ensureUser("raghav@vishaktech.com", "Raghav Menon", UserRole.USER);
    }

    private void ensureUser(String email, String fullName, UserRole role) {
        if (userRepository.findByEmail(email).isPresent()) {
            return;
        }
        User user = new User();
        user.setEmail(email);
        user.setFullName(fullName);
        user.setRole(role);
        user.setEnabled(true);
        user.setPassword(passwordEncoder.encode(TEST_PASSWORD));
        userRepository.save(user);
    }
}
