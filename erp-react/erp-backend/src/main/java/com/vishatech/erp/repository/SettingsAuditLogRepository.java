package com.vishatech.erp.repository;

import com.vishatech.erp.entity.SettingsAuditLog;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettingsAuditLogRepository extends JpaRepository<SettingsAuditLog, Long> {

    List<SettingsAuditLog> findBySettingKeyOrderByChangedAtDesc(String settingKey);

    Page<SettingsAuditLog> findBySettingKeyOrderByChangedAtDesc(String settingKey, Pageable pageable);
}
