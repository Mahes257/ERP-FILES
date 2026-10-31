package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.NotificationRequest;
import com.vishatech.erp.dto.NotificationResponse;
import com.vishatech.erp.service.NotificationService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * In-app notification REST API.
 *
 * All endpoints require authentication. Record-level access control
 * (user sees only own notifications) is enforced in {@link NotificationService}.
 */
@RestController
@RequestMapping("/notifications")
@PreAuthorize("hasAuthority('NOTIFICATION_VIEW')")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    /** Create a notification (any authenticated user can send to any other user). */
    @PreAuthorize("hasAuthority('NOTIFICATION_MANAGE')")
    @PostMapping
    public ResponseEntity<ApiResponse<NotificationResponse>> create(
            @Valid @RequestBody NotificationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(notificationService.create(request)));
    }

    /**
     * List the authenticated user's notifications, newest first.
     *
     * <p>The response body stays a plain array (existing consumers unchanged).
     * Paging is opt-in via {@code ?page=&size=}; the total is returned in
     * {@code X-Total-Count} so a paging UI can render page counts without a
     * second endpoint.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<NotificationResponse>>> list(
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        NotificationService.NotificationPage result =
                notificationService.listForCurrentUser(page, size);
        return ResponseEntity.ok()
                .header("X-Total-Count", Long.toString(result.totalElements()))
                .header("X-Page", Integer.toString(result.page()))
                .header("X-Page-Size", Integer.toString(result.size()))
                .body(ApiResponse.ok(result.items()));
    }

    /** Unread count for the authenticated user. */
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<Long>> unreadCount() {
        return ResponseEntity.ok(ApiResponse.ok(notificationService.unreadCount()));
    }

    /** Mark a single notification as read. */
    @PreAuthorize("hasAuthority('NOTIFICATION_MANAGE')")
    @PostMapping("/{id}/read")
    public ResponseEntity<ApiResponse<NotificationResponse>> markAsRead(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(notificationService.markAsRead(id)));
    }

    /** Resolve (dismiss) a notification — cancels pending reminders. */
    @PreAuthorize("hasAuthority('NOTIFICATION_MANAGE')")
    @PostMapping("/{id}/resolve")
    public ResponseEntity<ApiResponse<NotificationResponse>> resolve(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(notificationService.resolve(id)));
    }

    /** Cleanup test notifications (PoC only). */
    @PreAuthorize("hasAuthority('NOTIFICATION_MANAGE')")
    @DeleteMapping("/test-cleanup")
    public ResponseEntity<ApiResponse<Void>> cleanupTest() {
        int removed = notificationService.cleanupTestNotifications();
        return ResponseEntity.ok(ApiResponse.ok("Removed " + removed + " test notification(s)"));
    }
}
