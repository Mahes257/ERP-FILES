package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.ProductionMachineDTO;
import com.vishatech.erp.dto.production.ProductionMachineRequest;
import com.vishatech.erp.dto.production.ProductionStatusMasterDTO;
import com.vishatech.erp.dto.production.ProductionStatusMasterRequest;
import com.vishatech.erp.dto.production.ProductionWorkCenterDTO;
import com.vishatech.erp.dto.production.ProductionWorkCenterRequest;
import com.vishatech.erp.service.production.ProductionSettingsService;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Production → Settings master data.
 *
 * <pre>
 *   /production/settings/machines          GET POST     | /machines/{code}         PUT DELETE
 *   /production/settings/work-centers      GET POST     | /work-centers/{code}     PUT DELETE
 *   /production/settings/status-masters    GET POST     | /status-masters/{id}     PUT DELETE
 *   /production/settings/parameters        GET PUT
 *   /production/settings/users             GET PUT
 * </pre>
 *
 * <p>The path identifier is the value the screen itself treats as the record's
 * identity: the user-entered code for machines and work centers (same as the
 * old localStorage key), and the numeric primary key for statuses, whose name
 * is editable. Nothing here is hardcoded and nothing is stored in the browser.
 *
 * <p><b>Two gates per write.</b> The pre-existing {@code PRODUCTION_*} authority
 * keeps working unchanged and Production Access Management adds the section's
 * own switch on top ({@code settings.create} / {@code settings.edit} /
 * {@code settings.delete}), so "may view Production Settings" can never imply
 * "may change the Production configuration".
 */
@RestController
@RequestMapping("/production/settings")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class ProductionSettingsController {

    private final ProductionSettingsService service;

    public ProductionSettingsController(ProductionSettingsService service) {
        this.service = service;
    }

    // ============================== Machines ==============================

    @GetMapping("/machines")
    public ResponseEntity<ApiResponse<List<ProductionMachineDTO>>> listMachines(
            @RequestParam(required = false) String department) {
        return ResponseEntity.ok(ApiResponse.ok(service.listMachines(department)));
    }

    @PostMapping("/machines")
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE') and @productionAccess.can('settings','create')")
    public ResponseEntity<ApiResponse<ProductionMachineDTO>> createMachine(
            @RequestBody ProductionMachineRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Machine created.", service.createMachine(request)));
    }

    @PutMapping("/machines/{code}")
    @PreAuthorize("hasAuthority('PRODUCTION_EDIT') and @productionAccess.can('settings','edit')")
    public ResponseEntity<ApiResponse<ProductionMachineDTO>> updateMachine(
            @PathVariable String code,
            @RequestBody ProductionMachineRequest request) {
        return ResponseEntity.ok(ApiResponse.ok("Machine updated.", service.updateMachine(code, request)));
    }

    @DeleteMapping("/machines/{code}")
    @PreAuthorize("hasAuthority('PRODUCTION_DELETE') and @productionAccess.can('settings','delete')")
    public ResponseEntity<ApiResponse<Void>> deleteMachine(@PathVariable String code) {
        service.deleteMachine(code);
        return ResponseEntity.ok(ApiResponse.ok("Machine deleted."));
    }

    // ============================ Work centers ============================

    @GetMapping("/work-centers")
    public ResponseEntity<ApiResponse<List<ProductionWorkCenterDTO>>> listWorkCenters(
            @RequestParam(required = false) String department) {
        return ResponseEntity.ok(ApiResponse.ok(service.listWorkCenters(department)));
    }

    @PostMapping("/work-centers")
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE') and @productionAccess.can('settings','create')")
    public ResponseEntity<ApiResponse<ProductionWorkCenterDTO>> createWorkCenter(
            @RequestBody ProductionWorkCenterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Work center created.", service.createWorkCenter(request)));
    }

    @PutMapping("/work-centers/{code}")
    @PreAuthorize("hasAuthority('PRODUCTION_EDIT') and @productionAccess.can('settings','edit')")
    public ResponseEntity<ApiResponse<ProductionWorkCenterDTO>> updateWorkCenter(
            @PathVariable String code,
            @RequestBody ProductionWorkCenterRequest request) {
        return ResponseEntity.ok(ApiResponse.ok("Work center updated.", service.updateWorkCenter(code, request)));
    }

    @DeleteMapping("/work-centers/{code}")
    @PreAuthorize("hasAuthority('PRODUCTION_DELETE') and @productionAccess.can('settings','delete')")
    public ResponseEntity<ApiResponse<Void>> deleteWorkCenter(@PathVariable String code) {
        service.deleteWorkCenter(code);
        return ResponseEntity.ok(ApiResponse.ok("Work center deleted."));
    }

    // =========================== Status masters ===========================

    @GetMapping("/status-masters")
    public ResponseEntity<ApiResponse<List<ProductionStatusMasterDTO>>> listStatuses(
            @RequestParam(required = false) String category) {
        return ResponseEntity.ok(ApiResponse.ok(service.listStatuses(category)));
    }

    @PostMapping("/status-masters")
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE') and @productionAccess.can('settings','create')")
    public ResponseEntity<ApiResponse<ProductionStatusMasterDTO>> createStatus(
            @RequestBody ProductionStatusMasterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Status created.", service.createStatus(request)));
    }

    @PutMapping("/status-masters/{id}")
    @PreAuthorize("hasAuthority('PRODUCTION_EDIT') and @productionAccess.can('settings','edit')")
    public ResponseEntity<ApiResponse<ProductionStatusMasterDTO>> updateStatus(
            @PathVariable Long id,
            @RequestBody ProductionStatusMasterRequest request) {
        return ResponseEntity.ok(ApiResponse.ok("Status updated.", service.updateStatus(id, request)));
    }

    @DeleteMapping("/status-masters/{id}")
    @PreAuthorize("hasAuthority('PRODUCTION_DELETE') and @productionAccess.can('settings','delete')")
    public ResponseEntity<ApiResponse<Void>> deleteStatus(@PathVariable Long id) {
        service.deleteStatus(id);
        return ResponseEntity.ok(ApiResponse.ok("Status deleted."));
    }

    // ============================ Parameters ==============================

    @GetMapping("/parameters")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getParameters() {
        return ResponseEntity.ok(ApiResponse.ok(service.getParameters()));
    }

    @PutMapping("/parameters")
    @PreAuthorize("hasAuthority('PRODUCTION_EDIT') and @productionAccess.can('settings','edit')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveParameters(
            @RequestBody Map<String, Object> values) {
        return ResponseEntity.ok(ApiResponse.ok("Production parameters saved.", service.saveParameters(values)));
    }

    // =========================== Notifications ============================

    /**
     * The Production notification preferences (one boolean per workflow event).
     *
     * <p>Read by Production Settings → Notifications and by nothing else: the
     * publisher reads the same store server-side, so a toggle switched here takes
     * effect on the very next workflow transition without a deploy.
     */
    @GetMapping("/notifications")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getNotifications() {
        return ResponseEntity.ok(ApiResponse.ok(service.getNotificationPreferences()));
    }

    /**
     * Save the notification preferences.
     *
     * <p>Gated exactly like every other Production Settings write: the
     * {@code PRODUCTION_EDIT} authority AND Production Access Management's
     * {@code settings.edit}, so "may view Production Settings" never implies "may
     * silence the module's alerts".
     */
    @PutMapping("/notifications")
    @PreAuthorize("hasAuthority('PRODUCTION_EDIT') and @productionAccess.can('settings','edit')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveNotifications(
            @RequestBody Map<String, Object> values) {
        return ResponseEntity.ok(ApiResponse.ok("Production notification preferences saved.",
                service.saveNotificationPreferences(values)));
    }

    // =========================== Users & Roles ============================

    /**
     * The Production user register (master data, not login accounts).
     *
     * <p>Read here by Users &amp; Roles and by Access Management's User selector
     * (through {@code /production/access/options}), so both screens see the same
     * list and a newly created user is immediately selectable.
     */
    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listUsers() {
        return ResponseEntity.ok(ApiResponse.ok(service.listUsers()));
    }

    /**
     * Replace the register. The server keeps the stable {@code USR-NNN} id of an
     * existing record — that is the key an individual Production permission
     * configuration is stored under — and assigns one to a new record.
     */
    @PutMapping("/users")
    @PreAuthorize("hasAuthority('PRODUCTION_EDIT') and @productionAccess.can('settings','edit')")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> saveUsers(
            @RequestBody List<Map<String, Object>> users) {
        return ResponseEntity.ok(ApiResponse.ok("Production users saved.", service.saveUsers(users)));
    }
}
