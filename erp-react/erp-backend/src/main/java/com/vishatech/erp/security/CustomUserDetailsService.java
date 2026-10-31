package com.vishatech.erp.security;

import com.vishatech.erp.entity.User;
import com.vishatech.erp.repository.UserRepository;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public CustomUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + email));
        List<org.springframework.security.core.GrantedAuthority> authorities = new ArrayList<>();
        // Role authority — the existing role-based checks (hasRole / hasAnyRole)
        // keep working unchanged.
        authorities.add(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
        // Permission authorities — the RolePermissions map expanded so the
        // module controllers' hasAuthority('PURCHASE_*') checks actually see
        // the permissions their role implies. Nothing is read from client
        // input: permissions are derived server-side from the persisted role.
        for (Permission permission : RolePermissions.permissionsOf(user.getRole())) {
            authorities.add(new SimpleGrantedAuthority(permission.name()));
        }
        return new org.springframework.security.core.userdetails.User(
                user.getEmail(),
                user.getPassword(),
                user.isEnabled(),
                !user.isAccountExpired(),
                !user.isCredentialsExpired(),
                !user.isLocked(),
                authorities
        );
    }
}
