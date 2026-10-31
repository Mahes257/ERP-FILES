package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * History record for Drawing actions.
 * Records every important Drawing action for audit and timeline display.
 */
@Entity
@Table(name = "drawing_history")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DrawingHistory extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drawing_id", nullable = false)
    private Drawing drawing;

    @Column(name = "action", nullable = false, length = 100)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 30)
    private DrawingStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", length = 30)
    private DrawingStatus toStatus;

    @Column(name = "performed_by", length = 255)
    private String performedBy;

    @Column(name = "performed_at", nullable = false)
    private Instant performedAt;

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;
}
