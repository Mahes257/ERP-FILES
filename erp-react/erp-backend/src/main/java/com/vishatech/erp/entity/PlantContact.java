package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One contact row inside a Questionnaire Form's "Contact Details" section (9).
 *
 * <p>Departments: Purchase, Mechanical, Cooler, Vertical Roller Mill,
 * Pre Heater & Kiln, Plant Director, Plant DGM, Purchase Head.
 *
 * <p>Each department may have MULTIPLE contacts — multiple rows with the same
 * department value are permitted.
 */
@Entity
@Table(name = "qform_plant_contacts")
public class PlantContact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long formId;

    /** Department name (Purchase, Mechanical, Cooler, VRM, Pre Heater & Kiln, Plant Director, Plant DGM, Purchase Head). */
    @Column(nullable = false, length = 80)
    private String department;

    /** Person in charge name. */
    private String personInCharge;

    /** Mobile number. */
    private String mobile;

    /** Mail ID. */
    private String mailId;

    /** Ordering within the same department. */
    private Integer sortOrder;

    // ---- Getters and Setters -----------------------------------------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getFormId() { return formId; }
    public void setFormId(Long formId) { this.formId = formId; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getPersonInCharge() { return personInCharge; }
    public void setPersonInCharge(String personInCharge) { this.personInCharge = personInCharge; }

    public String getMobile() { return mobile; }
    public void setMobile(String mobile) { this.mobile = mobile; }

    public String getMailId() { return mailId; }
    public void setMailId(String mailId) { this.mailId = mailId; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
