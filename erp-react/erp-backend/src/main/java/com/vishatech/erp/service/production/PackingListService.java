package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.PackingListDTO;
import com.vishatech.erp.dto.production.PackingStatsDTO;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.entity.production.PackingStatus;
import com.vishatech.erp.repository.production.PackingListRepository;
import jakarta.persistence.EntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.NoSuchElementException;

@Service
@Transactional
public class PackingListService {

    private static final java.util.logging.Logger log =
            java.util.logging.Logger.getLogger(PackingListService.class.getName());

    private final PackingListRepository repository;
    private final EntityManager entityManager;
    /** Packing events — gated by Production Settings → Notifications. */
    private final ProductionNotificationPublisher notificationPublisher;

    public PackingListService(PackingListRepository repository, EntityManager entityManager,
                              ProductionNotificationPublisher notificationPublisher) {
        this.repository = repository;
        this.entityManager = entityManager;
        this.notificationPublisher = notificationPublisher;
    }

    public PagedResponse<PackingListDTO> getAll(String search, String status, int page, int size, String sortBy, String sortDir) {
        Sort sort = Sort.by(Sort.Direction.fromString(sortDir), mapSortField(sortBy));
        PageRequest pageable = PageRequest.of(page, size, sort);

        Page<PackingList> result;
        boolean hasStatus = status != null && !status.isBlank();
        boolean hasSearch = search != null && !search.isBlank();
        if (hasStatus && hasSearch) {
            // A search inside a status tab must keep the tab's status filter.
            PackingStatus ps = PackingStatus.valueOf(status.toUpperCase().replace(' ', '_'));
            result = repository.searchByStatus(ps, search.trim(), pageable);
        } else if (hasStatus) {
            PackingStatus ps = PackingStatus.valueOf(status.toUpperCase().replace(' ', '_'));
            result = repository.findByStatus(ps, pageable);
        } else if (hasSearch) {
            result = repository.findByPackingListNumberContainingIgnoreCaseOrWorkOrderIdContainingIgnoreCaseOrProductContainingIgnoreCaseOrCustomerContainingIgnoreCase(
                    search, search, search, search, pageable);
        } else {
            result = repository.findAll(pageable);
        }

        return PagedResponse.<PackingListDTO>builder()
            .content(result.getContent().stream().map(this::toDTO).toList())
            .page(result.getNumber())
            .size(result.getSize())
            .totalElements(result.getTotalElements())
            .totalPages(result.getTotalPages())
            .first(result.isFirst())
            .last(result.isLast())
            .build();
    }

    public PackingListDTO getById(Long id) {
        PackingList entity = repository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Packing list not found with id: " + id));
        return toDTO(entity);
    }

    public PackingListDTO getByPackingListNumber(String packingListNumber) {
        PackingList entity = repository.findByPackingListNumber(packingListNumber)
            .orElseThrow(() -> new NoSuchElementException("Packing list not found: " + packingListNumber));
        return toDTO(entity);
    }

    public PackingListDTO create(PackingListDTO request) {
        String packingListNumber = request.getPackingListNumber();
        if (packingListNumber == null || packingListNumber.isBlank()) {
            packingListNumber = generatePackingListNumber();
        }

        PackingList entity = PackingList.builder()
            .packingListNumber(packingListNumber)
            .workOrderId(request.getWorkOrderId())
            .salesOrderNumber(request.getSalesOrderNumber())
            .customer(request.getCustomer())
            .product(request.getProduct())
            .productionQuantity(request.getProductionQuantity() != null ? request.getProductionQuantity() : 0)
            .packedQuantity(request.getPackedQuantity() != null ? request.getPackedQuantity() : 0)
            .packingDate(request.getPackingDate())
            .status(request.getStatus() != null ? PackingStatus.valueOf(request.getStatus().toUpperCase().replace(' ', '_')) : PackingStatus.PENDING)
            .remarks(request.getRemarks())
            .createdBy("System")
            .build();

        entity = repository.save(entity);
        entityManager.flush();
        notify(ProductionNotificationPublisher.PACK_PENDING, entity, "Packing pending",
                "Packing list " + entity.getPackingListNumber() + workOrderSuffix(entity)
                        + " was created and is waiting to be packed.");
        return toDTO(entity);
    }

    public PackingListDTO update(Long id, PackingListDTO request) {
        PackingList entity = repository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Packing list not found with id: " + id));

        PackingStatus previousStatus = entity.getStatus();

        if (request.getWorkOrderId() != null) entity.setWorkOrderId(request.getWorkOrderId());
        if (request.getSalesOrderNumber() != null) entity.setSalesOrderNumber(request.getSalesOrderNumber());
        if (request.getCustomer() != null) entity.setCustomer(request.getCustomer());
        if (request.getProduct() != null) entity.setProduct(request.getProduct());
        if (request.getProductionQuantity() != null) entity.setProductionQuantity(request.getProductionQuantity());
        if (request.getPackedQuantity() != null) entity.setPackedQuantity(request.getPackedQuantity());
        if (request.getPackingDate() != null) entity.setPackingDate(request.getPackingDate());
        if (request.getStatus() != null) entity.setStatus(PackingStatus.valueOf(request.getStatus().toUpperCase().replace(' ', '_')));
        if (request.getRemarks() != null) entity.setRemarks(request.getRemarks());
        entity.setUpdatedBy("System");

        entity = repository.save(entity);
        entityManager.flush();

        // Only a genuine arrival at a completed state notifies; re-saving an
        // already-completed list (a remark edit) must not raise it again.
        boolean completed = entity.getStatus() == PackingStatus.COMPLETED
                || entity.getStatus() == PackingStatus.READY_FOR_DISPATCH;
        boolean alreadyCompleted = previousStatus == PackingStatus.COMPLETED
                || previousStatus == PackingStatus.READY_FOR_DISPATCH;
        if (completed && !alreadyCompleted) {
            notify(ProductionNotificationPublisher.PACK_COMPLETED, entity, "Packing completed",
                    "Packing list " + entity.getPackingListNumber() + workOrderSuffix(entity)
                            + " is " + entity.getStatus().name().replace('_', ' ').toLowerCase() + ".");
        }
        return toDTO(entity);
    }

    /* ========================
     * Notifications
     * ======================== */

    private void notify(String event, PackingList entity, String title, String message) {
        try {
            notificationPublisher.publish(event, ProductionNotificationPublisher.REF_PACKING,
                    entity.getId(), title, message, "NORMAL", entity.getStatus());
        } catch (Exception e) {
            log.warning("Packing notification skipped [packingList=" + entity.getId() + "]: "
                    + e.getMessage());
        }
    }

    private static String workOrderSuffix(PackingList entity) {
        String workOrder = entity.getWorkOrderId();
        if (workOrder == null || workOrder.isBlank()) {
            return "";
        }
        String customer = entity.getCustomer() == null || entity.getCustomer().isBlank()
                ? "" : " for " + entity.getCustomer();
        return " (work order " + workOrder + customer + ")";
    }

    public void delete(Long id) {
        PackingList entity = repository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Packing list not found with id: " + id));
        repository.delete(entity);
    }

    public PackingStatsDTO getStatistics() {
        return PackingStatsDTO.builder()
            .total(repository.count())
            .pending(repository.countByStatus(PackingStatus.PENDING))
            .inProgress(repository.countByStatus(PackingStatus.IN_PROGRESS))
            .completed(repository.countByStatus(PackingStatus.COMPLETED))
            .readyForDispatch(repository.countByStatus(PackingStatus.READY_FOR_DISPATCH))
            .build();
    }

    private PackingListDTO toDTO(PackingList entity) {
        return PackingListDTO.builder()
            .id(entity.getId())
            .packingListNumber(entity.getPackingListNumber())
            .workOrderId(entity.getWorkOrderId())
            .salesOrderNumber(entity.getSalesOrderNumber())
            .customer(entity.getCustomer())
            .product(entity.getProduct())
            .productionQuantity(entity.getProductionQuantity())
            .packedQuantity(entity.getPackedQuantity())
            .packingDate(entity.getPackingDate())
            .status(entity.getStatus() != null ? entity.getStatus().name().replace('_', ' ') : null)
            .remarks(entity.getRemarks())
            .createdBy(entity.getCreatedBy())
            .createdAt(entity.getCreatedAt())
            .updatedAt(entity.getUpdatedAt())
            .build();
    }

    private synchronized String generatePackingListNumber() {
        long seq = repository.count() + 1;
        String number;
        do {
            number = String.format("PL-%04d", seq++);
        } while (repository.existsByPackingListNumber(number));
        return number;
    }

    private String mapSortField(String frontendField) {
        if (frontendField == null) return "createdAt";
        return switch (frontendField.toLowerCase()) {
            case "packinglistnumber", "packing_list_number", "id" -> "packingListNumber";
            case "workorderid", "work_order_id" -> "workOrderId";
            case "product" -> "product";
            case "customer" -> "customer";
            case "status" -> "status";
            case "packingdate", "packing_date" -> "packingDate";
            default -> "createdAt";
        };
    }
}
