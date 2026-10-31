package com.vishatech.erp.util.production;

import com.vishatech.erp.entity.production.ProductionType;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.Query;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Thread-safe Work Order number and Batch number generator.
 * Uses database-level pessimistic locking to prevent concurrent duplicates.
 */
@Component
public class NumberGenerator {

    private final ProductionOrderRepository productionOrderRepository;
    private final EntityManager entityManager;

    private static final Pattern WO_PATTERN = Pattern.compile("^WO-(\\d+)$");
    private static final Pattern BATCH_PATTERN = Pattern.compile("^(CAST|FAB|ASM)-(\\d+)$");

    public NumberGenerator(ProductionOrderRepository productionOrderRepository,
                           EntityManager entityManager) {
        this.productionOrderRepository = productionOrderRepository;
        this.entityManager = entityManager;
    }

    /**
     * Generate the next Work Order number: WO-0001, WO-0002, ...
     *
     * The next number is the maximum `WO-nnnn` already in the table plus one,
     * so numbers that do not follow the pattern (legacy / imported work orders
     * such as `TEST-PO-010`) can never make the generator hand out one that is
     * already taken. Reading only the newest row used to do exactly that and
     * every create was rejected by the work_order unique constraint.
     * Synchronized (single JVM) to keep concurrent requests from racing.
     */
    @Transactional
    public synchronized String generateWorkOrderNumber() {
        int maxNum = 0;
        for (String workOrder : productionOrderRepository.findAllWorkOrderNumbers()) {
            if (workOrder == null) continue;
            Matcher m = WO_PATTERN.matcher(workOrder);
            if (m.matches()) {
                int num = Integer.parseInt(m.group(1));
                if (num > maxNum) maxNum = num;
            }
        }
        return String.format("WO-%04d", maxNum + 1);
    }

    /**
     * Generate the next Batch Number for a production type.
     * CAST-001, FAB-001, ASM-001, etc.
     * Uses pessimistic locking to prevent concurrent duplicates.
     */
    @Transactional
    public synchronized String generateBatchNumber(ProductionType productionType) {
        String prefix = productionType.getBatchPrefix();
        List<String> existing = productionOrderRepository.findBatchNumbersByPrefix(prefix);
        int maxNum = 0;
        for (String bn : existing) {
            Matcher m = BATCH_PATTERN.matcher(bn);
            if (m.matches() && m.group(1).equals(prefix)) {
                int num = Integer.parseInt(m.group(2));
                if (num > maxNum) maxNum = num;
            }
        }
        return String.format("%s-%03d", prefix, maxNum + 1);
    }
}
