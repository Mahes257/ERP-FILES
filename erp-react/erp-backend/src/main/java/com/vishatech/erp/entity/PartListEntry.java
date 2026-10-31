package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * One row of the Part List table (section 7) inside a Questionnaire Form.
 *
 * <p>Fixed rows by default: Cooler, Pre Heater, Kiln, Crusher, VRM,
 * Cement Ball Mill.  The marketer fills in GA, Dimensional Drawing, and
 * Availability of Sample for each machine.
 */
@Entity
@Table(name = "qform_part_list_entries")
public class PartListEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long formId;

    /** Sequential number (1–6). */
    private Integer sno;

    /** Machine name — Cooler, Pre Heater, Kiln, Crusher, VRM, Cement Ball Mill */
    @Column(nullable = false, length = 80)
    private String machine;

    /** GA (General Arrangement) details. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String ga;

    /** Dimensional Drawing details. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String dimensionalDrawing;

    /** Availability of Sample and details. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String availabilityOfSample;

    // ---- Getters and Setters -----------------------------------------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getFormId() { return formId; }
    public void setFormId(Long formId) { this.formId = formId; }

    public Integer getSno() { return sno; }
    public void setSno(Integer sno) { this.sno = sno; }

    public String getMachine() { return machine; }
    public void setMachine(String machine) { this.machine = machine; }

    public String getGa() { return ga; }
    public void setGa(String ga) { this.ga = ga; }

    public String getDimensionalDrawing() { return dimensionalDrawing; }
    public void setDimensionalDrawing(String dimensionalDrawing) { this.dimensionalDrawing = dimensionalDrawing; }

    public String getAvailabilityOfSample() { return availabilityOfSample; }
    public void setAvailabilityOfSample(String availabilityOfSample) { this.availabilityOfSample = availabilityOfSample; }
}
