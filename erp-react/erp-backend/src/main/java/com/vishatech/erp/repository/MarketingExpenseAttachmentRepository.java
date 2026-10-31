package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingExpenseAttachment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarketingExpenseAttachmentRepository extends JpaRepository<MarketingExpenseAttachment, Long> {

    List<MarketingExpenseAttachment> findByExpenseIdOrderByUploadedAtDesc(Long expenseId);

    List<MarketingExpenseAttachment> findByTripIdOrderByUploadedAtDesc(Long tripId);

    void deleteByExpenseId(Long expenseId);

    void deleteByTripId(Long tripId);
}
