package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * One row of OEM detail data within a Questionnaire Form.
 *
 * <p>Used for sections 3, 4, 5, 6 and 8:
 *   - Plant OEM (Cooler / Pre Heater / Kiln)
 *   - VRM OEM (Vertical Roller Mill)
 *   - Cement Mill / Ball Mill OEM
 *   - Clinker Crusher
 *   - Packing Plant OEM
 *
 * <p>The {@code section} field distinguishes which section the row belongs to.
 * The {@code machine} field identifies the specific machine (e.g. "Cooler",
 * "Pre Heater", "VRM").  OEM columns are stored as individual text fields;
 * each section's set of OEM brands differs, so every cell that is not
 * applicable for a row is simply left null.
 */
@Entity
@Table(name = "qform_plant_oem_details")
public class PlantOemDetail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long formId;

    /** Section this row belongs to: PLANT_OEM / VRM_OEM / CEMENT_MILL_OEM / CLINKER_CRUSHER / PACKING_PLANT_OEM */
    @Column(nullable = false, length = 40)
    private String section;

    /** Machine name: Cooler, Pre Heater, Kiln, VRM, Hammer Impact, etc. */
    @Column(nullable = false, length = 80)
    private String machine;

    // ---- Plant OEM columns (section 3) ------------------------------------
    private String ikn;
    private String flSmith;
    private String polysius;
    private String khd;
    private String claudiusPeters;
    private String sinoma;

    // ---- VRM OEM columns (section 4) --------------------------------------
    private String loesche;
    private String gebrPfeiffer;
    private String pfeiffer;
    private String pfeifferPartNumber;
    private String atox;

    // ---- Cement Mill OEM columns (section 5) ------------------------------
    private String christianPfeiffer;
    private String vega;
    private String megatoux;

    // ---- Clinker Crusher (section 6) — Roller sub-types -------------------
    private String rollerIkn;
    private String rollerFlSmith;
    private String hammerImpact;

    // ---- Packing Plant OEM (section 8) ------------------------------------
    private String vendomatic;
    private String buemer;
    private String haverBooker;
    private String china;
    private String packingOemOther;

    // ---- Ordering ---------------------------------------------------------
    private Integer sortOrder;

    // ---- Getters and Setters -----------------------------------------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getFormId() { return formId; }
    public void setFormId(Long formId) { this.formId = formId; }

    public String getSection() { return section; }
    public void setSection(String section) { this.section = section; }

    public String getMachine() { return machine; }
    public void setMachine(String machine) { this.machine = machine; }

    public String getIkn() { return ikn; }
    public void setIkn(String ikn) { this.ikn = ikn; }

    public String getFlSmith() { return flSmith; }
    public void setFlSmith(String flSmith) { this.flSmith = flSmith; }

    public String getPolysius() { return polysius; }
    public void setPolysius(String polysius) { this.polysius = polysius; }

    public String getKhd() { return khd; }
    public void setKhd(String khd) { this.khd = khd; }

    public String getClaudiusPeters() { return claudiusPeters; }
    public void setClaudiusPeters(String claudiusPeters) { this.claudiusPeters = claudiusPeters; }

    public String getSinoma() { return sinoma; }
    public void setSinoma(String sinoma) { this.sinoma = sinoma; }

    public String getLoesche() { return loesche; }
    public void setLoesche(String loesche) { this.loesche = loesche; }

    public String getGebrPfeiffer() { return gebrPfeiffer; }
    public void setGebrPfeiffer(String gebrPfeiffer) { this.gebrPfeiffer = gebrPfeiffer; }

    public String getPfeiffer() { return pfeiffer; }
    public void setPfeiffer(String pfeiffer) { this.pfeiffer = pfeiffer; }

    public String getPfeifferPartNumber() { return pfeifferPartNumber; }
    public void setPfeifferPartNumber(String pfeifferPartNumber) { this.pfeifferPartNumber = pfeifferPartNumber; }

    public String getAtox() { return atox; }
    public void setAtox(String atox) { this.atox = atox; }

    public String getChristianPfeiffer() { return christianPfeiffer; }
    public void setChristianPfeiffer(String christianPfeiffer) { this.christianPfeiffer = christianPfeiffer; }

    public String getVega() { return vega; }
    public void setVega(String vega) { this.vega = vega; }

    public String getMegatoux() { return megatoux; }
    public void setMegatoux(String megatoux) { this.megatoux = megatoux; }

    public String getRollerIkn() { return rollerIkn; }
    public void setRollerIkn(String rollerIkn) { this.rollerIkn = rollerIkn; }

    public String getRollerFlSmith() { return rollerFlSmith; }
    public void setRollerFlSmith(String rollerFlSmith) { this.rollerFlSmith = rollerFlSmith; }

    public String getHammerImpact() { return hammerImpact; }
    public void setHammerImpact(String hammerImpact) { this.hammerImpact = hammerImpact; }

    public String getVendomatic() { return vendomatic; }
    public void setVendomatic(String vendomatic) { this.vendomatic = vendomatic; }

    public String getBuemer() { return buemer; }
    public void setBuemer(String buemer) { this.buemer = buemer; }

    public String getHaverBooker() { return haverBooker; }
    public void setHaverBooker(String haverBooker) { this.haverBooker = haverBooker; }

    public String getChina() { return china; }
    public void setChina(String china) { this.china = china; }

    public String getPackingOemOther() { return packingOemOther; }
    public void setPackingOemOther(String packingOemOther) { this.packingOemOther = packingOemOther; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
