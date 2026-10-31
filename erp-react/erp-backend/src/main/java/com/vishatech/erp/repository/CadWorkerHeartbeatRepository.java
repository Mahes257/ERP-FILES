package com.vishatech.erp.repository;

import com.vishatech.erp.entity.CadWorkerHeartbeat;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Collection;

public interface CadWorkerHeartbeatRepository extends JpaRepository<CadWorkerHeartbeat, String> {

    /** Housekeeping: forget workers that have been silent for a long time. */
    long deleteByUpdatedAtBeforeAndIdNotIn(LocalDateTime cutoff, Collection<String> liveWorkerIds);
}
