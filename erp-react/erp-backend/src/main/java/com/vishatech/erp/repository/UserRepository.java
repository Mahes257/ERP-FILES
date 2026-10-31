package com.vishatech.erp.repository;

import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    /** Enabled users of one role — Purchase notification recipients. */
    List<User> findByRoleAndEnabledTrue(UserRole role);

    /** Enabled users of any of the given roles. */
    List<User> findByRoleInAndEnabledTrue(Collection<UserRole> roles);
}
