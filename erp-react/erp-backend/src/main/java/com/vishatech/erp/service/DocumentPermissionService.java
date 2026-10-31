package com.vishatech.erp.service;

import com.vishatech.erp.entity.DocumentRepositoryEntry;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.util.AuditContext;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Centralized document access-control — the single place visibility is
 * resolved. Every check reads the authenticated user from the server-side
 * {@link AuditContext} (never from client input), so the frontend can only
 * show/hide affordances; the backend is authoritative.
 *
 * Visibility semantics (see {@link DocumentVisibility}):
 * <ol>
 *   <li>ADMIN_ONLY — authenticated ADMIN only (no owner bypass).</li>
 *   <li>SALES_TEAM_ONLY / ACCOUNTS_TEAM_ONLY / PURCHASE_TEAM_ONLY —
 *       the SOURCE model resolves these against {@code users.team}. That user
 *       attribute is not part of the TARGET user model yet, so these values are
 *       currently restricted to ADMIN (the most restrictive interpretation).
 *       When the team concept lands, the three {@code isAdminOrTeam} branches
 *       become team checks — nothing else in this class changes.</li>
 *   <li>TEAM_ONLY / CUSTOMER / BOTH — legacy values, unchanged: any
 *       authenticated internal ERP user. Customer exposure of CUSTOMER/BOTH
 *       documents is enforced by the customer-facing/forwarding paths, not here.</li>
 * </ol>
 *
 * Lifecycle rules (unchanged): view/download/edit gated by visibility as
 * above; archive/soft-delete stay ADMIN or uploader; permanent delete ADMIN.
 */
@Service
public class DocumentPermissionService {

    private final AuditContext auditContext;

    public DocumentPermissionService(AuditContext auditContext) {
        this.auditContext = auditContext;
    }

    /** True when the current user may see this document (list, detail, file). */
    public boolean canView(DocumentRepositoryEntry doc) {
        User user = auditContext.currentUser();
        if (user == null) return false;
        return isViewable(user, doc.getVisibility());
    }

    /** True when the current user may download the file. */
    public boolean canDownload(DocumentRepositoryEntry doc) {
        return canView(doc);
    }

    /**
     * True when the current user may edit document metadata. Editing is not
     * tied to who uploaded the document, but the user must be able to SEE it.
     */
    public boolean canEdit(DocumentRepositoryEntry doc) {
        return canView(doc) && auditContext.currentUser() != null;
    }

    /**
     * True when the current user may delete/archive the document.
     * Destructive lifecycle actions stay limited to ADMIN and the uploader.
     */
    public boolean canDelete(DocumentRepositoryEntry doc) {
        User user = auditContext.currentUser();
        if (user == null) return false;
        if (isAdmin(user)) return true;
        return isOwner(doc, user);
    }

    /**
     * Changing visibility requires BOTH edit rights AND view access — a user
     * who cannot see a document can never re-scope it.
     */
    public boolean canChangeVisibility(DocumentRepositoryEntry doc) {
        return canView(doc) && canEdit(doc);
    }

    /** True when the current user may upload a new version. */
    public boolean canUploadVersion(DocumentRepositoryEntry doc) {
        return canView(doc) && canEdit(doc);
    }

    /** True when the current user may permanently delete. */
    public boolean canPermanentDelete(DocumentRepositoryEntry doc) {
        User user = auditContext.currentUser();
        if (user == null) return false;
        return isAdmin(user);
    }

    /**
     * The visibility values the given user may access. Used for row-level
     * checks AND pushed into the list query so page counts stay accurate.
     * ADMIN gets every value; non-admins get the three legacy values (the
     * team-scoped values are ADMIN-only until the team attribute exists).
     */
    public List<DocumentVisibility> allowedVisibilities(User user) {
        if (user == null) return List.of();
        if (user.getRole() == UserRole.ADMIN) {
            return List.of(DocumentVisibility.values());
        }
        List<DocumentVisibility> allowed = new ArrayList<>();
        allowed.add(DocumentVisibility.TEAM_ONLY);
        allowed.add(DocumentVisibility.CUSTOMER);
        allowed.add(DocumentVisibility.BOTH);
        return allowed;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private boolean isViewable(User user, DocumentVisibility vis) {
        // Defensive: a null visibility (should not happen — column is NOT NULL)
        // is treated as the legacy team value so existing access is preserved.
        if (vis == null) return true;
        switch (vis) {
            case ADMIN_ONLY:
                return isAdmin(user);
            case SALES_TEAM_ONLY:
            case ACCOUNTS_TEAM_ONLY:
            case PURCHASE_TEAM_ONLY:
                // Team-scoped visibility: ADMIN only until users.team is modelled.
                return isAdmin(user);
            default:
                // TEAM_ONLY / CUSTOMER / BOTH — unchanged legacy behaviour for
                // any authenticated internal ERP user.
                return true;
        }
    }

    private boolean isAdmin(User user) {
        return user.getRole() == UserRole.ADMIN;
    }

    private boolean isOwner(DocumentRepositoryEntry doc, User user) {
        if (doc.getUploadedById() == null) return false;
        return doc.getUploadedById().equals(user.getId());
    }
}
