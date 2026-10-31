package com.vishatech.erp.crm.entity;

public enum LeadStage {
    // Legacy temperature stages kept for data safety (no UI exposes them anymore).
    HOT,
    WARM,
    COLD,
    // ERP pipeline stages (ERP/js/leads.js) — New → Contacted → Qualified →
    // Proposal → Proposal Sent → Negotiation → Won → Lost.
    NEW,
    CONTACTED,
    QUALIFIED,
    PROPOSAL,
    PROPOSAL_SENT,
    NEGOTIATION,
    WON,
    LOST
}
