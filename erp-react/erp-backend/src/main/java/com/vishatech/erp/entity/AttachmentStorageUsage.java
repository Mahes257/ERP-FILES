package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Single-row ledger for the shared project-wide attachment storage pool.
 *
 * One row ({@code id = 1}) holds the running total of everything stored across
 * the eight attachment tables, so an upload can be checked against the 4 GB
 * limit with a primary-key lookup instead of eight {@code SUM(size)} scans over
 * every attachment table.
 *
 * <h2>How the row is maintained</h2>
 * {@link com.vishatech.erp.service.AttachmentStorageLedgerListener} reports every
 * attachment insert and delete; the totals are applied with an atomic SQL
 * increment ({@code total_bytes = total_bytes + ?}) in the SAME transaction as
 * the attachment row it accounts for. Nothing is ever computed by
 * read-modify-write, so concurrent uploads cannot lose an update, and a rolled
 * back upload takes its increment with it.
 *
 * Hibernate owns this table's schema (so {@code ddl-auto=validate} still guards
 * against a missing or drifted ledger in production), but the arithmetic is done
 * with native SQL through
 * {@link com.vishatech.erp.repository.AttachmentStorageUsageRepository} — see
 * {@code docs/attachment_storage_usage.sql} for the DDL that creates and seeds
 * the row, and {@code AttachmentStorageService.reconcile} for the check that
 * compares the maintained total against the attachment tables.
 */
@Entity
@Table(name = "attachment_storage_usage")
public class AttachmentStorageUsage {

    /** The ledger is a singleton: its primary key is always this value. */
    public static final long SINGLETON_ID = 1L;

    @Id
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "total_bytes", nullable = false)
    private long totalBytes;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public long getTotalBytes() {
        return totalBytes;
    }

    public void setTotalBytes(long totalBytes) {
        this.totalBytes = totalBytes;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
