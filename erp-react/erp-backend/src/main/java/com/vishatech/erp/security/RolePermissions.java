package com.vishatech.erp.security;

import com.vishatech.erp.entity.UserRole;
import java.util.EnumSet;
import java.util.Set;

/**
 * Maps the existing roles to the permission set they would receive today.
 *
 * This is the single source of truth for role → permission expansion. It is
 * intentionally unused by the current role-based checks (which keep working
 * unchanged); it exists so permission-based authorization can be layered on
 * later without redesigning the role model.
 */
public final class RolePermissions {

    private RolePermissions() {
    }

    public static Set<Permission> permissionsOf(UserRole role) {
        if (role == null) {
            return Set.of();
        }
        return switch (role) {
            case ADMIN -> EnumSet.allOf(Permission.class);
            case MANAGER -> EnumSet.of(
                    // Sales
                    Permission.SALES_VIEW, Permission.SALES_CREATE,
                    Permission.SALES_EDIT, Permission.SALES_DELETE, Permission.SALES_APPROVE,
                    // Purchase
                    Permission.PURCHASE_VIEW, Permission.PURCHASE_CREATE,
                    Permission.PURCHASE_EDIT, Permission.PURCHASE_APPROVE,
                    // Production
                    Permission.PRODUCTION_VIEW, Permission.PRODUCTION_CREATE,
                    Permission.PRODUCTION_EDIT, Permission.PRODUCTION_DELETE,
                    Permission.PRODUCTION_APPROVE, Permission.PRODUCTION_DISPATCH,
                    // CRM
                    Permission.CRM_VIEW, Permission.CRM_CREATE,
                    Permission.CRM_EDIT, Permission.CRM_DELETE,
                    // CPR
                    Permission.CPR_VIEW, Permission.CPR_CREATE,
                    Permission.CPR_EDIT, Permission.CPR_DELETE, Permission.CPR_APPROVE,
                    // Marketing
                    Permission.MARKETING_VIEW, Permission.MARKETING_CREATE,
                    Permission.MARKETING_EDIT, Permission.MARKETING_DELETE,
                    // Documents
                    Permission.DOCUMENT_VIEW, Permission.DOCUMENT_CREATE,
                    Permission.DOCUMENT_EDIT, Permission.DOCUMENT_DELETE,
                    // Notifications
                    Permission.NOTIFICATION_VIEW, Permission.NOTIFICATION_MANAGE);
            case USER -> EnumSet.of(
                    // Sales
                    Permission.SALES_VIEW, Permission.SALES_CREATE, Permission.SALES_EDIT,
                    // Purchase
                    Permission.PURCHASE_VIEW, Permission.PURCHASE_CREATE, Permission.PURCHASE_EDIT,
                    // Production
                    Permission.PRODUCTION_VIEW, Permission.PRODUCTION_CREATE, Permission.PRODUCTION_EDIT,
                    // CRM
                    Permission.CRM_VIEW, Permission.CRM_CREATE, Permission.CRM_EDIT,
                    // CPR
                    Permission.CPR_VIEW, Permission.CPR_CREATE, Permission.CPR_EDIT,
                    // Marketing (a marketer fully manages their own records — the
                    // service still enforces record-level ownership on every write)
                    Permission.MARKETING_VIEW, Permission.MARKETING_CREATE, Permission.MARKETING_EDIT,
                    Permission.MARKETING_DELETE,
                    // Documents
                    Permission.DOCUMENT_VIEW, Permission.DOCUMENT_CREATE,
                    // Notifications
                    Permission.NOTIFICATION_VIEW);
        };
    }
}
