package com.vishatech.erp.production.access;

import com.vishatech.erp.exception.ForbiddenException;
import com.vishatech.erp.production.access.ProductionAccessPolicy.Requirement;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Enforcement point for every Production API.
 *
 * <p>Mounted on the Production paths (see {@link ProductionAccessWebConfig}),
 * it resolves the (area, action) the request needs and asks
 * {@link ProductionAccessService}. A
 * denial is a real 403 from the server — the UI's hidden buttons are only a
 * convenience on top of it, never the security boundary. The existing
 * {@code @PreAuthorize("hasAuthority('PRODUCTION_…')")} checks, business
 * validation and the approval workflow rules inside the services are untouched:
 * this check runs before the controller and only ever <em>adds</em> a gate.
 *
 * <p>{@code /production/access/**} is excluded by the request policy so an
 * administrator can always reach Access Management (the controller itself is
 * ROLE_ADMIN gated).
 */
@Component
public class ProductionAccessInterceptor implements HandlerInterceptor {

    private final ProductionAccessService accessService;

    public ProductionAccessInterceptor(ProductionAccessService accessService) {
        this.accessService = accessService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true; // CORS preflight carries no credentials
        }
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        Requirement requirement = ProductionAccessPolicy.resolve(
                request.getMethod(), path, request.getQueryString());
        if (requirement == null) {
            return true;
        }
        if (!accessService.can(requirement)) {
            throw new ForbiddenException("Production access denied: "
                    + requirement.area().key() + " " + requirement.action().key());
        }
        return true;
    }
}
