package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PartListEntry;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PartListEntryRepository extends JpaRepository<PartListEntry, Long> {

    List<PartListEntry> findByFormIdOrderBySnoAscIdAsc(Long formId);

    void deleteByFormId(Long formId);
}
