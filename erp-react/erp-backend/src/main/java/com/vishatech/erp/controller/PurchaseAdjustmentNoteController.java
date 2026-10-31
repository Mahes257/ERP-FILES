package com.vishatech.erp.controller;

import com.vishatech.erp.service.PurchaseAdjustmentNoteService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/purchase/adjustment-notes")
@CrossOrigin(origins = "http://localhost:5173")
public class PurchaseAdjustmentNoteController {

    private final PurchaseAdjustmentNoteService service;

    public PurchaseAdjustmentNoteController(PurchaseAdjustmentNoteService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String sort) {
        Page<Map<String, Object>> notes = service.list(page, size, search, status, sort);
        return ResponseEntity.ok(Map.of(
            "data", notes.getContent(),
            "page", notes.getNumber(),
            "size", notes.getSize(),
            "total", notes.getTotalElements(),
            "totalPages", notes.getTotalPages()
        ));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<Map<String, Object>> get(@PathVariable String id) {
        Map<String, Object> note;
        try {
            Long longId = Long.parseLong(id);
            note = service.get(longId);
        } catch (NumberFormatException e) {
            note = service.getByNoteNo(id);
        }
        return ResponseEntity.ok(note);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        Map<String, Object> note = service.create(body);
        return ResponseEntity.ok(note);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<Map<String, Object>> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> note = service.update(id, body);
        return ResponseEntity.ok(note);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<Map<String, Object>> submit(@PathVariable Long id) {
        Map<String, Object> note = service.submit(id);
        return ResponseEntity.ok(note);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<Map<String, Object>> approve(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String comments = (String) body.getOrDefault("comments", "");
        Map<String, Object> note = service.approve(id, comments);
        return ResponseEntity.ok(note);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<Map<String, Object>> reject(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String comments = (String) body.getOrDefault("comments", "");
        Map<String, Object> note = service.reject(id, comments);
        return ResponseEntity.ok(note);
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<Map<String, Object>> stats() {
        return ResponseEntity.ok(service.stats());
    }

    @GetMapping("/next-number")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<Map<String, Object>> nextNumber(@RequestParam(defaultValue = "Credit") String noteType) {
        return ResponseEntity.ok(service.nextNumber(noteType));
    }
}
