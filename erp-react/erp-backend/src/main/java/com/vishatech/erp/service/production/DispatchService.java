package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.DispatchDTO;
import com.vishatech.erp.dto.production.DispatchStatsDTO;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.entity.production.Dispatch;
import com.vishatech.erp.entity.production.DispatchStatus;
import com.vishatech.erp.repository.production.DispatchRepository;
import jakarta.persistence.EntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.NoSuchElementException;

@Service
@Transactional
public class DispatchService {

    private static final java.util.logging.Logger log =
            java.util.logging.Logger.getLogger(DispatchService.class.getName());

    private final DispatchRepository repository;
    private final EntityManager entityManager;
    /** Dispatch events — gated by Production Settings → Notifications. */
    private final ProductionNotificationPublisher notificationPublisher;

    public DispatchService(DispatchRepository repository, EntityManager entityManager,
                           ProductionNotificationPublisher notificationPublisher) {
        this.repository = repository;
        this.entityManager = entityManager;
        this.notificationPublisher = notificationPublisher;
    }

    public PagedResponse<DispatchDTO> getAll(String search, String status, int page, int size, String sortBy, String sortDir) {
        Sort sort = Sort.by(Sort.Direction.fromString(sortDir), mapSortField(sortBy));
        PageRequest pageable = PageRequest.of(page, size, sort);

        Page<Dispatch> result;
        if (status != null && !status.isBlank()) {
            DispatchStatus ds = DispatchStatus.valueOf(status.toUpperCase().replace(' ', '_'));
            result = repository.findByStatus(ds, pageable);
        } else if (search != null && !search.isBlank()) {
            result = repository.findByDispatchNumberContainingIgnoreCaseOrWorkOrderIdContainingIgnoreCaseOrProductContainingIgnoreCaseOrCustomerContainingIgnoreCaseOrTransporterContainingIgnoreCase(
                    search, search, search, search, search, pageable);
        } else {
            result = repository.findAll(pageable);
        }

        return PagedResponse.<DispatchDTO>builder()
            .content(result.getContent().stream().map(this::toDTO).toList())
            .page(result.getNumber())
            .size(result.getSize())
            .totalElements(result.getTotalElements())
            .totalPages(result.getTotalPages())
            .first(result.isFirst())
            .last(result.isLast())
            .build();
    }

    public DispatchDTO getById(Long id) {
        Dispatch entity = repository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Dispatch not found with id: " + id));
        return toDTO(entity);
    }

    public DispatchDTO getByDispatchNumber(String dispatchNumber) {
        Dispatch entity = repository.findByDispatchNumber(dispatchNumber)
            .orElseThrow(() -> new NoSuchElementException("Dispatch not found: " + dispatchNumber));
        return toDTO(entity);
    }

    public DispatchDTO create(DispatchDTO request) {
        String dispatchNumber = request.getDispatchNumber();
        if (dispatchNumber == null || dispatchNumber.isBlank()) {
            dispatchNumber = generateDispatchNumber();
        }

        Dispatch entity = Dispatch.builder()
            .dispatchNumber(dispatchNumber)
            .workOrderId(request.getWorkOrderId())
            .packingListId(request.getPackingListId())
            .salesOrderNumber(request.getSalesOrderNumber())
            .customer(request.getCustomer())
            .product(request.getProduct())
            .quantity(request.getQuantity() != null ? request.getQuantity() : 0)
            .dispatchDate(request.getDispatchDate())
            .expectedDeliveryDate(request.getExpectedDeliveryDate())
            .transporter(request.getTransporter())
            .vehicleNumber(request.getVehicleNumber())
            .lrTrackingNumber(request.getLrTrackingNumber())
            .packingStatus(request.getPackingStatus())
            .packageCount(request.getPackageCount())
            .status(request.getStatus() != null ? DispatchStatus.valueOf(request.getStatus().toUpperCase().replace(' ', '_')) : DispatchStatus.DRAFT)
            .remarks(request.getRemarks())
            .createdBy("System")
            .build();

        entity = repository.save(entity);
        entityManager.flush();
        notify(ProductionNotificationPublisher.DISP_PENDING, entity, "Dispatch pending",
                "Dispatch " + entity.getDispatchNumber() + workOrderSuffix(entity)
                        + " was created and is waiting to leave the factory.");
        return toDTO(entity);
    }

    public DispatchDTO update(Long id, DispatchDTO request) {
        Dispatch entity = repository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Dispatch not found with id: " + id));

        DispatchStatus previousStatus = entity.getStatus();

        if (request.getWorkOrderId() != null) entity.setWorkOrderId(request.getWorkOrderId());
        if (request.getPackingListId() != null) entity.setPackingListId(request.getPackingListId());
        if (request.getSalesOrderNumber() != null) entity.setSalesOrderNumber(request.getSalesOrderNumber());
        if (request.getCustomer() != null) entity.setCustomer(request.getCustomer());
        if (request.getProduct() != null) entity.setProduct(request.getProduct());
        if (request.getQuantity() != null) entity.setQuantity(request.getQuantity());
        if (request.getDispatchDate() != null) entity.setDispatchDate(request.getDispatchDate());
        if (request.getExpectedDeliveryDate() != null) entity.setExpectedDeliveryDate(request.getExpectedDeliveryDate());
        if (request.getTransporter() != null) entity.setTransporter(request.getTransporter());
        if (request.getVehicleNumber() != null) entity.setVehicleNumber(request.getVehicleNumber());
        if (request.getLrTrackingNumber() != null) entity.setLrTrackingNumber(request.getLrTrackingNumber());
        if (request.getPackingStatus() != null) entity.setPackingStatus(request.getPackingStatus());
        if (request.getPackageCount() != null) entity.setPackageCount(request.getPackageCount());
        if (request.getStatus() != null) entity.setStatus(DispatchStatus.valueOf(request.getStatus().toUpperCase().replace(' ', '_')));
        if (request.getRemarks() != null) entity.setRemarks(request.getRemarks());
        entity.setUpdatedBy("System");

        entity = repository.save(entity);
        entityManager.flush();

        // Leaving the factory is the event the team tracks; saving an already
        // dispatched record (a transporter change) must not raise it again.
        boolean dispatchDone = entity.getStatus() == DispatchStatus.DISPATCHED
                || entity.getStatus() == DispatchStatus.IN_TRANSIT
                || entity.getStatus() == DispatchStatus.DELIVERED;
        boolean alreadyDone = previousStatus == DispatchStatus.DISPATCHED
                || previousStatus == DispatchStatus.IN_TRANSIT
                || previousStatus == DispatchStatus.DELIVERED;
        if (dispatchDone && !alreadyDone) {
            notify(ProductionNotificationPublisher.DISP_COMPLETED, entity, "Dispatch completed",
                    "Dispatch " + entity.getDispatchNumber() + workOrderSuffix(entity)
                            + " is " + entity.getStatus().name().replace('_', ' ').toLowerCase() + ".");
        }
        return toDTO(entity);
    }

    /* ========================
     * Notifications
     * ======================== */

    private void notify(String event, Dispatch entity, String title, String message) {
        try {
            notificationPublisher.publish(event, ProductionNotificationPublisher.REF_DISPATCH,
                    entity.getId(), title, message, "NORMAL", entity.getStatus());
        } catch (Exception e) {
            log.warning("Dispatch notification skipped [dispatch=" + entity.getId() + "]: "
                    + e.getMessage());
        }
    }

    private static String workOrderSuffix(Dispatch entity) {
        String workOrder = entity.getWorkOrderId();
        if (workOrder == null || workOrder.isBlank()) {
            return "";
        }
        String customer = entity.getCustomer() == null || entity.getCustomer().isBlank()
                ? "" : " for " + entity.getCustomer();
        return " (work order " + workOrder + customer + ")";
    }

    public void delete(Long id) {
        Dispatch entity = repository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Dispatch not found with id: " + id));
        repository.delete(entity);
    }

    public DispatchStatsDTO getStatistics() {
        return DispatchStatsDTO.builder()
            .total(repository.count())
            .draft(repository.countByStatus(DispatchStatus.DRAFT))
            .ready(repository.countByStatus(DispatchStatus.READY))
            .dispatched(repository.countByStatus(DispatchStatus.DISPATCHED))
            .inTransit(repository.countByStatus(DispatchStatus.IN_TRANSIT))
            .delivered(repository.countByStatus(DispatchStatus.DELIVERED))
            .build();
    }

    private DispatchDTO toDTO(Dispatch entity) {
        return DispatchDTO.builder()
            .id(entity.getId())
            .dispatchNumber(entity.getDispatchNumber())
            .workOrderId(entity.getWorkOrderId())
            .packingListId(entity.getPackingListId())
            .salesOrderNumber(entity.getSalesOrderNumber())
            .customer(entity.getCustomer())
            .product(entity.getProduct())
            .quantity(entity.getQuantity())
            .dispatchDate(entity.getDispatchDate())
            .expectedDeliveryDate(entity.getExpectedDeliveryDate())
            .transporter(entity.getTransporter())
            .vehicleNumber(entity.getVehicleNumber())
            .lrTrackingNumber(entity.getLrTrackingNumber())
            .packingStatus(entity.getPackingStatus())
            .packageCount(entity.getPackageCount())
            .status(entity.getStatus() != null ? entity.getStatus().name().replace('_', ' ') : null)
            .remarks(entity.getRemarks())
            .createdBy(entity.getCreatedBy())
            .createdAt(entity.getCreatedAt())
            .updatedAt(entity.getUpdatedAt())
            .build();
    }

    /**
     * Next free DISP-<seq> number. `count() + 1` alone is not safe: after any
     * delete the count falls back and the derived number can collide with a
     * record that still exists (querying it then fails with a unique violation).
     * Step past every number that is already taken.
     */
    private synchronized String generateDispatchNumber() {
        long seq = repository.count() + 1;
        String number;
        do {
            number = String.format("DISP-%03d", seq++);
        } while (repository.existsByDispatchNumber(number));
        return number;
    }

    private String mapSortField(String frontendField) {
        if (frontendField == null) return "createdAt";
        return switch (frontendField.toLowerCase()) {
            case "dispatchnumber", "dispatch_number", "id" -> "dispatchNumber";
            case "workorderid", "work_order_id" -> "workOrderId";
            case "product" -> "product";
            case "customer" -> "customer";
            case "status" -> "status";
            case "dispatchdate", "dispatch_date" -> "dispatchDate";
            default -> "createdAt";
        };
    }
}
