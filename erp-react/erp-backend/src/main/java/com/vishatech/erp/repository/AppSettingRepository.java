package com.vishatech.erp.repository;

import com.vishatech.erp.entity.AppSetting;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppSettingRepository extends JpaRepository<AppSetting, Long> {

    Optional<AppSetting> findBySettingKey(String settingKey);

    /**
     * Atomic insert-or-update keyed on the unique setting_key. Avoids the
     * find-then-insert race where two concurrent first-writes both see "absent"
     * and the loser fails with a duplicate-key error (MySQL 1062 / H2 23505).
     * Works on MySQL and H2 in MODE=MySQL.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at)
            VALUES (:key, :value, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE setting_value = :value, updated_at = CURRENT_TIMESTAMP
            """, nativeQuery = true)
    void upsert(@Param("key") String key, @Param("value") String value);
}
