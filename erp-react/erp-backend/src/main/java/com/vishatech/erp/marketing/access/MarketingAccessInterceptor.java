package com.vishatech.erp.marketing.access;

import com.vishatech.erp.exception.ForbiddenException;
import com.vishatech.erp.marketing.access.MarketingAccessPolicy.Requirement;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Enforcement point for every Marketing API.
 *
 * Mounted on {@code /marketing/**}, it resolves the (area, action) the request
 * needs and asks {@link MarketingAccessService}. A denial is a real 403 from the
 * server — the UI's hidden buttons are only a convenience on top of it, never
 * the security boundary. Business validation, record-level ownership checks and
 * the approval workflow rules inside the services are untouched: this check runs
 * before the controller and only adds an authorization gate.
 *
 * {@code /marketing/access/**} is excluded by the request policy so an
 * administrator can always reach Access Management (the controller itself is
 * ROLE_ADMIN gated).
 */
@Component
public class MarketingAccessInterceptor implements HandlerInterceptor {

    private final MarketingAccessService accessService;

    public MarketingAccessInterceptor(MarketingAccessService accessService) {
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
        Requirement requirement = MarketingAccessPolicy.resolve(request.getMethod(), path);
        if (requirement == null) {
            return true;
        }
        if (!accessService.can(requirement)) {
            throw new ForbiddenException("Marketing access denied: "
                    + requirement.area().key() + " " + requirement.action().key());
        }
        return true;
    }
}
