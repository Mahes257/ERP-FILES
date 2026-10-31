package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Timeline event for a Production Order.
 * Records every significant state change as a persistent event.
 */
@Entity
@Table(name = "timeline_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TimelineEvent extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "production_order_id", nullable = false)
    private ProductionOrder productionOrder;

    @Column(name = "event_name", nullable = false, length = 200)
    private String eventName;

    @Column(name = "event_time", nullable = false)
    private Instant eventTime;

    @Column(name = "status", length = 50)
    private String status;

    @Column(name = "performed_by", length = 255)
    private String performedBy;

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;
}
