package com.vishatech.erp.repository;

import com.vishatech.erp.entity.Activity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityRepository extends JpaRepository<Activity, Long> {

    List<Activity> findByLeadIdOrderByCreatedAtAsc(Long leadId);
}
