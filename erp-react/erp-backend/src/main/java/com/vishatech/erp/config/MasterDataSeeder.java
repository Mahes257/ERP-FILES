package com.vishatech.erp.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.MasterValue;
import com.vishatech.erp.repository.CwMasterDataRepository;
import com.vishatech.erp.repository.MasterValueRepository;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.Lead;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds the default master lists (previously hardcoded in the React forms) into
 * the {@code master_values} table on first startup. Each key is only seeded when
 * it has no rows, so values added/edited/deleted by users are never overwritten
 * by a restart.
 *
 * <p>Cost Workout categories and units additionally merge any custom values that
 * were previously stored in the legacy {@code cw_master_data} table, so existing
 * custom values survive the migration to the unified master system.</p>
 */
@Component
public class MasterDataSeeder implements CommandLineRunner {

    private final MasterValueRepository repository;
    private final CwMasterDataRepository cwMasterDataRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public MasterDataSeeder(MasterValueRepository repository,
                            CwMasterDataRepository cwMasterDataRepository) {
        this.repository = repository;
        this.cwMasterDataRepository = cwMasterDataRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        // ---- CPR module ----
        seedIfEmpty("pr_departments", List.of(
                "Production", "Quality", "Engineering", "Maintenance", "Stores",
                "Logistics", "R&D", "IT", "HR", "Administration", "Marketing", "Finance"));
        seedIfEmpty("pr_priorities", List.of("Low", "Medium", "High", "Critical"));
        seedIfEmpty("pr_requested_by", List.of(
                "Ramesh Patel", "Suresh Kumar", "Amit Singh", "Priya Sharma",
                "Vijay Kumar", "Neha Gupta", "Admin User"));
        seedIfEmpty("pr_units", List.of(
                "Nos", "Kg", "Meter", "Feet", "Set", "Pair", "Box", "Litre",
                "PCS", "Lump Sum", "Day", "Roll", "Sets"));
        seedIfEmpty("cw_departments", List.of(
                "Production", "Purchase", "Stores", "Maintenance", "Quality", "Sales",
                "Accounts", "Admin", "HR", "IT", "Engineering", "Logistics", "R&D"));

        // ---- Sales Execution module (mirrors the original ERP dropdowns) ----
        seedIfEmpty("sales_executives", List.of(
                "Kavya Krishnan", "Raghav Menon", "Divya Nair", "Arun Pillai",
                "Sneha Iyer", "Vikram Rao", "Priya Menon"));
        seedIfEmpty("payment_terms", List.of("30 Days", "45 Days", "60 Days", "Advance", "COD"));
        seedIfEmpty("delivery_terms", List.of(
                "Ex-Works", "FOB", "CIF", "CFR", "FOR",
                "Door Delivery", "Freight Paid", "Freight To Pay"));
        seedIfEmpty("transport_companies", List.of(
                "Blue Dart", "DTDC", "VRL Logistics", "Gati", "Delhivery", "Self", "Other"));
        seedIfEmpty("bank_types", List.of(
                "Current Account", "Savings Account", "Overdraft"));
        seedIfEmpty("payment_modes", List.of("Cash", "Cheque", "Bank Transfer", "UPI", "Card"));
        seedIfEmpty("credit_note_reasons", List.of(
                "Return of Goods", "Defective Products", "Price Adjustment",
                "Discount After Sale", "GST Correction", "Invoice Error",
                "Customer Cancellation", "Other"));
        seedIfEmpty("currencies", List.of("INR", "USD", "EUR", "GBP", "AED", "SGD"));
        seedIfEmpty("companies", List.of("VISHAK TECH"));
        seedIfEmpty("countries", List.of(
                "United States", "United Kingdom", "Australia", "Canada", "Singapore",
                "New Zealand", "South Africa", "Ireland", "India"));
        seedIfEmpty("states", List.of(
                "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
                "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
                "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
                "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
                "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
                "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
                "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
                "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"));
        seedIfEmpty("cities", List.of(
                "Chennai", "Bangalore", "Mumbai", "Hyderabad", "Delhi",
                "Pune", "Ahmedabad", "Kolkata"));
        seedIfEmpty("durations", List.of(
                "1 Month", "3 Months", "6 Months", "1 Year", "2 Years", "3 Years", "5 Years"));
        seedIfEmpty("warranty_terms", List.of(
                "3 Months", "6 Months", "1 Year", "2 Years", "3 Years"));
        seedIfEmpty("units", List.of(
                "kg", "ton", "mtr", "sqm", "sheet", "nos", "pcs", "set", "box", "roll"));
        seedIfEmpty("package_types", List.of(
                "Wooden Box", "Carton Box", "Pallet", "Crate", "Drum", "Bag", "Bale", "Other"));

        // ---- Clients module (mirrors the original ERP client-create Add & Manage lists) ----
        seedIfEmpty("client_industries", List.of(
                "Manufacturing", "Cement Industry", "Thermal Power Plant", "Nuclear Power Plant",
                "Steel Industry", "Chemical Industry"));
        seedIfEmpty("client_types", List.of(
                "Individual", "Company", "Sole Proprietorship", "Partnership", "LLP", "NGO"));
        seedIfEmpty("tax_treatments", List.of(
                "Registered", "Unregistered", "Consumer", "Overseas", "SEZ", "Deemed Export"));
        seedIfEmpty("client_categories", List.of(
                "Retail", "Wholesale", "Distributor", "Manufacturer", "Service Provider",
                "Government", "Exporter", "Importer"));
        seedIfEmpty("client_payment_terms", List.of(
                "Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90"));
        seedIfEmpty("client_statuses", List.of(
                "New", "Active", "Inactive", "Converted", "Archived"));
        seedIfEmpty("sales_persons", List.of("Admin User"));

        // ---- Cost Workout categories & units (system + migrated custom values) ----
        seedIfEmptyMerged("cw_categories", List.of(
                "Material Cost", "Labour Cost", "Machining Cost", "Fabrication Cost",
                "Assembly Cost", "Packing Cost", "Transport Cost", "Installation Cost",
                "Vendor Cost", "Overhead Cost", "Pattern Cost", "Molding Cost",
                "Fettling Cost", "Blasting Cost", "Heat Treatment", "Powder Coating",
                "Painting", "Lead Time", "Miscellaneous"));
        seedIfEmptyMerged("cw_units", List.of(
                "Nos", "Kg", "Gram", "Ton", "Meter", "Millimeter (mm)", "Centimeter (cm)",
                "Feet", "Inch", "Sq.ft", "Sq.m", "Cubic Meter", "Litre", "Millilitre",
                "Piece", "Pair", "Set", "Box", "Bundle", "Roll", "Coil", "Hours",
                "Minutes", "Days", "Weeks", "Months"));

        // ---- Marketing Follow-up / Extension module ----
        seedIfEmpty("mkt_designations", List.of(
                "Purchase Manager", "Sales Manager", "Accounts Manager", "HR Manager",
                "Managing Director", "Operations Head", "Plant Head", "Quality Manager",
                "Store Manager", "Maintenance Manager"));
        seedIfEmpty("mkt_departments", List.of(
                "Purchase", "Sales", "Accounts", "Finance", "HR", "Operations",
                "Quality", "Maintenance", "Stores", "Production", "Administration"));
        seedIfEmpty("mkt_followup_types", List.of(
                "Phone Call", "WhatsApp", "Email", "Physical Meeting", "Online Meeting"));
        seedIfEmpty("mkt_statuses", List.of(
                "Pending", "Scheduled", "Completed", "Interested", "Not Interested",
                "Negotiation", "Waiting for Customer", "Quotation Required",
                "Converted", "Cancelled", "Overdue", "Rescheduled"));
        seedIfEmpty("mkt_outcomes", List.of(
                "Interested", "Not Interested", "Need More Discussion",
                "Quotation Required", "Negotiation", "Converted", "No Lead",
                "Existing Order", "Lost Opportunity"));
        seedIfEmpty("mkt_next_actions", List.of(
                "Send Quotation", "Follow-up Call", "Schedule Meeting",
                "Send Email", "Visit Again", "Create Lead", "Handover to Sales",
                "No Action Required"));
        seedIfEmpty("mkt_groups", List.of(
                "New Prospects", "Follow-up Required", "High Priority",
                "Existing Customers", "Campaign Group", "Area-wise Group"));
    }

    /** Seed a key with the system list plus any legacy custom values stored in cw_master_data. */
    private void seedIfEmptyMerged(String key, List<String> systemValues) {
        Set<String> merged = new LinkedHashSet<>(systemValues);
        cwMasterDataRepository.findByDataKey(key).ifPresent(row -> {
            String raw = row.getValue();
            if (raw == null || raw.isBlank()) {
                return;
            }
            try {
                List<String> custom = objectMapper.readValue(raw, new TypeReference<List<String>>() { });
                merged.addAll(custom.stream().filter(v -> v != null && !v.isBlank()).map(String::trim).toList());
            } catch (Exception ignored) {
                // legacy value is malformed; system list is enough
            }
        });
        seedIfEmpty(key, new ArrayList<>(merged));
    }

    private void seedIfEmpty(String key, List<String> values) {
        if (repository.countByMasterKey(key) > 0) {
            return;
        }
        for (String value : values) {
            MasterValue mv = new MasterValue();
            mv.setMasterKey(key);
            mv.setValue(value);
            repository.save(mv);
        }
    }
}
