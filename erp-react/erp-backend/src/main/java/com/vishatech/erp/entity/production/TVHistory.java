package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * History record for Technical Verification actions.
 * Records every important TV action for audit and timeline display.
 */
@Entity
@Table(name = "tv_history")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TVHistory extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "technical_verification_id", nullable = false)
    private TechnicalVerification technicalVerification;

    @Column(name = "action", nullable = false, length = 100)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 30)
    private TVStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", length = 30)
    private TVStatus toStatus;

    @Column(name = "performed_by", length = 255)
    private String performedBy;

    @Column(name = "performed_at", nullable = false)
    private Instant performedAt;

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;
}
