package com.vishatech.erp.crm.repository;

import com.vishatech.erp.crm.entity.Customer;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CustomerRepository extends JpaRepository<Customer, Long> {

    @Query("SELECT c FROM Customer c "
            + "WHERE (:status IS NULL OR :status = '' OR c.status = :status) "
            // Default view excludes trashed clients (only visible in the Deleted tab).
            + "AND (:status IS NOT NULL AND :status <> '' OR c.status <> 'Deleted') "
            + "AND (:q IS NULL OR :q = '' OR LOWER(c.businessName) LIKE CONCAT('%', LOWER(:q), '%') "
            + "OR LOWER(c.clientCode) LIKE CONCAT('%', LOWER(:q), '%') "
            + "OR LOWER(c.gstin) LIKE CONCAT('%', LOWER(:q), '%') "
            + "OR LOWER(c.phone) LIKE CONCAT('%', LOWER(:q), '%') "
            + "OR LOWER(c.contactPerson) LIKE CONCAT('%', LOWER(:q), '%') "
            + "OR LOWER(c.email) LIKE CONCAT('%', LOWER(:q), '%'))")
    List<Customer> search(@Param("q") String query, @Param("status") String status);

    /**
     * Every client code, projected as a single column so the code generator
     * never hydrates customer aggregates.
     */
    @Query("SELECT c.clientCode FROM Customer c WHERE c.clientCode IS NOT NULL")
    List<String> findClientCodes();

    Optional<Customer> findByClientCode(String clientCode);

    boolean existsByClientCode(String clientCode);

    /** Exact-match duplicate detection by GSTIN (case-insensitive). */
    Optional<Customer> findByGstinIgnoreCase(String gstin);

    /** Exact-match duplicate detection by PAN (case-insensitive). */
    Optional<Customer> findByPanIgnoreCase(String pan);

    /** Exact-match duplicate detection by business name (case-insensitive). */
    Optional<Customer> findByBusinessNameIgnoreCase(String businessName);

    // Master-value usage counts (delete protection for client master lists).
    long countByIndustryIgnoreCase(String industry);

    long countByClientTypeIgnoreCase(String clientType);

    long countByTaxTreatmentIgnoreCase(String taxTreatment);

    long countByCategoryIgnoreCase(String category);

    long countByPaymentTermsIgnoreCase(String paymentTerms);

    long countByStatusIgnoreCase(String status);

    long countBySalesPersonIgnoreCase(String salesPerson);

    // Location-master delete protection: how many clients reference a location.
    long countByCountryIgnoreCase(String country);

    long countByBillingStateIgnoreCase(String billingState);

    long countByBillingCityIgnoreCase(String billingCity);
}
