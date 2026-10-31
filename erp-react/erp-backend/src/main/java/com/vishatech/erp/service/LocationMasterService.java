package com.vishatech.erp.service;

import com.vishatech.erp.dto.LocationDtos.CityRequest;
import com.vishatech.erp.dto.LocationDtos.CityResponse;
import com.vishatech.erp.dto.LocationDtos.CountryRequest;
import com.vishatech.erp.dto.LocationDtos.CountryResponse;
import com.vishatech.erp.dto.LocationDtos.DistrictRequest;
import com.vishatech.erp.dto.LocationDtos.DistrictResponse;
import com.vishatech.erp.dto.LocationDtos.LocationOption;
import com.vishatech.erp.dto.LocationDtos.StateRequest;
import com.vishatech.erp.dto.LocationDtos.StateResponse;
import com.vishatech.erp.dto.LocationDtos.ValidationResult;
import com.vishatech.erp.entity.City;
import com.vishatech.erp.entity.Country;
import com.vishatech.erp.entity.District;
import com.vishatech.erp.entity.SettingsAuditLog;
import com.vishatech.erp.entity.StateRegion;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.CityRepository;
import com.vishatech.erp.repository.CountryRepository;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.repository.DeliveryChallanRepository;
import com.vishatech.erp.repository.DistrictRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.crm.repository.LeadRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.SalesContractRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.repository.SettingsAuditLogRepository;
import com.vishatech.erp.repository.StateRegionRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Centralized Location Master — ONE hierarchical system
 * (Country → State/Province → District → City/Town) that powers every
 * location dropdown in the ERP. MySQL is the single source of truth; the
 * frontend never keeps its own location lists.
 *
 * Rules implemented here (mirroring the ERP requirement):
 *  - Cascading reads: children only load once the parent is chosen; disabled
 *    parents hide the whole subtree from new selections.
 *  - Parent change implies child reset: the backend validates every stored
 *    combination (a Chennai-district city can never be saved under Erode).
 *  - No hard delete: locations referenced by Leads / Customers / Quotations /
 *    Contracts / CPOs / DCs / Invoices are protected — admins deactivate them
 *    instead, and historical records keep displaying the stored value.
 *  - Every admin mutation writes a SettingsAuditLog row (user, action,
 *    timestamp, affected location).
 *  - Optional `status` filter hides Inactive rows from new selections while
 *    list/admin views still return them.
 */
@Service
public class LocationMasterService {

    private static final Logger log = LoggerFactory.getLogger(LocationMasterService.class);
    private static final String AUDIT_KEY = "location_master";

    private final CountryRepository countryRepository;
    private final StateRegionRepository stateRepository;
    private final DistrictRepository districtRepository;
    private final CityRepository cityRepository;
    private final SettingsAuditLogRepository auditRepository;

    // Usage counters for the "no hard delete of used locations" protection.
    private final LeadRepository leadRepository;
    private final CustomerRepository customerRepository;
    private final QuotationRepository quotationRepository;
    private final SalesContractRepository salesContractRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final InvoiceRepository invoiceRepository;

    public LocationMasterService(CountryRepository countryRepository,
                                 StateRegionRepository stateRepository,
                                 DistrictRepository districtRepository,
                                 CityRepository cityRepository,
                                 SettingsAuditLogRepository auditRepository,
                                 LeadRepository leadRepository,
                                 CustomerRepository customerRepository,
                                 QuotationRepository quotationRepository,
                                 SalesContractRepository salesContractRepository,
                                 SalesOrderRepository salesOrderRepository,
                                 DeliveryChallanRepository deliveryChallanRepository,
                                 InvoiceRepository invoiceRepository) {
        this.countryRepository = countryRepository;
        this.stateRepository = stateRepository;
        this.districtRepository = districtRepository;
        this.cityRepository = cityRepository;
        this.auditRepository = auditRepository;
        this.leadRepository = leadRepository;
        this.customerRepository = customerRepository;
        this.quotationRepository = quotationRepository;
        this.salesContractRepository = salesContractRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.invoiceRepository = invoiceRepository;
    }

    // ========================= Reads (cascading) =========================

    /** All countries; active first. Inactive ones still come back so existing records can resolve. */
    @Transactional(readOnly = true)
    public List<LocationOption> countries() {
        return countryRepository.findAllByOrderByNameAsc().stream()
                .map(c -> new LocationOption(c.getId(), c.getName(), c.getStatus()))
                .toList();
    }

    /** States of one country (children of an Inactive country are hidden from new selections). */
    @Transactional(readOnly = true)
    public List<LocationOption> states(Long countryId) {
        Country country = getCountry(countryId);
        if (!isActive(country.getStatus())) {
            return List.of();
        }
        return stateRepository.findByCountryOrdered(countryId).stream()
                .map(s -> new LocationOption(s.getId(), s.getName(), s.getStatus()))
                .toList();
    }

    /** Districts of one state. */
    @Transactional(readOnly = true)
    public List<LocationOption> districts(Long stateId) {
        StateRegion state = getState(stateId);
        if (!isActive(state.getStatus()) || !isActive(state.getCountry().getStatus())) {
            return List.of();
        }
        return districtRepository.findByStateOrdered(stateId).stream()
                .map(d -> new LocationOption(d.getId(), d.getName(), d.getStatus()))
                .toList();
    }

    /** Cities of one district. */
    @Transactional(readOnly = true)
    public List<LocationOption> cities(Long districtId) {
        District district = getDistrict(districtId);
        if (!isActive(district.getStatus())
                || !isActive(district.getState().getStatus())
                || !isActive(district.getState().getCountry().getStatus())) {
            return List.of();
        }
        return cityRepository.findByDistrictOrdered(districtId).stream()
                .map(c -> new LocationOption(c.getId(), c.getName(), c.getStatus()))
                .toList();
    }

    /** Search cities by name within a country (used by large searchable pickers). */
    @Transactional(readOnly = true)
    public List<LocationOption> searchCities(Long countryId, String query, int limit) {
        Country country = getCountry(countryId);
        if (!isActive(country.getStatus())) {
            return List.of();
        }
        String q = query == null ? "" : query.trim();
        Pageable pageable = PageRequest.of(0, Math.min(Math.max(limit, 1), 100));
        return cityRepository.searchByCountry(countryId, q, pageable).getContent().stream()
                .map(c -> new LocationOption(c.getId(), c.getName(), c.getStatus()))
                .toList();
    }

    /**
     * Every city/town of one STATE (all districts merged) — the complete set the
     * state-level City/Town dropdown must offer. Deduped by name because a town
     * can appear in more than one district; the state/country must be active.
     */
    @Transactional(readOnly = true)
    public List<LocationOption> citiesByState(Long stateId) {
        StateRegion state = getState(stateId);
        if (!isActive(state.getStatus()) || !isActive(state.getCountry().getStatus())) {
            return List.of();
        }
        return dedupeByName(cityRepository.findByStateOrdered(stateId));
    }

    /** Server-side search of the city master inside one state (type-ahead for large lists). */
    @Transactional(readOnly = true)
    public List<LocationOption> searchCitiesByState(Long stateId, String query, int limit) {
        StateRegion state = getState(stateId);
        if (!isActive(state.getStatus()) || !isActive(state.getCountry().getStatus())) {
            return List.of();
        }
        String q = query == null ? "" : query.trim();
        Pageable pageable = PageRequest.of(0, Math.min(Math.max(limit, 1), 100));
        return dedupeByName(cityRepository.searchByState(stateId, q, pageable).getContent());
    }

    /** Preserve first occurrence per case-insensitive name so dropdowns never show duplicates. */
    private List<LocationOption> dedupeByName(List<City> cities) {
        Map<String, LocationOption> byName = new LinkedHashMap<>();
        for (City c : cities) {
            byName.putIfAbsent(c.getName().toLowerCase(Locale.ROOT),
                    new LocationOption(c.getId(), c.getName(), c.getStatus()));
        }
        return List.copyOf(byName.values());
    }

    /** Full admin list for the Settings → Location Master screen. */
    @Transactional(readOnly = true)
    public List<CountryResponse> adminCountries() {
        return countryRepository.findAllByOrderByNameAsc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<StateResponse> adminStates(Long countryId) {
        return stateRepository.findByCountryOrdered(countryId).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<DistrictResponse> adminDistricts(Long stateId) {
        return districtRepository.findByStateOrdered(stateId).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<CityResponse> adminCities(Long districtId) {
        return cityRepository.findByDistrictOrdered(districtId).stream().map(this::toResponse).toList();
    }

    /**
     * Backend validation of a full Country → State → District → City chain.
     * Every save path (Lead, Customer, Sales documents) funnels through this,
     * so an invalid combination is rejected even when crafted by hand.
     */
    @Transactional(readOnly = true)
    public ValidationResult validate(Long countryId, Long stateId, Long districtId, Long cityId) {
        if (countryId == null) {
            return new ValidationResult(true, null);
        }
        Country country = countryRepository.findById(countryId).orElse(null);
        if (country == null) {
            return new ValidationResult(false, "Selected country no longer exists");
        }
        if (stateId == null) {
            return new ValidationResult(true, null);
        }
        StateRegion state = stateRepository.findById(stateId).orElse(null);
        if (state == null || !state.getCountry().getId().equals(countryId)) {
            return new ValidationResult(false, "Selected state does not belong to the selected country");
        }
        if (districtId == null) {
            return new ValidationResult(true, null);
        }
        District district = districtRepository.findById(districtId).orElse(null);
        if (district == null || !district.getState().getId().equals(stateId)) {
            return new ValidationResult(false, "Selected district does not belong to the selected state");
        }
        if (cityId == null) {
            return new ValidationResult(true, null);
        }
        City city = cityRepository.findById(cityId).orElse(null);
        if (city == null || !city.getDistrict().getId().equals(districtId)) {
            return new ValidationResult(false, "Selected city does not belong to the selected district");
        }
        return new ValidationResult(true, null);
    }

    /**
     * Name-based validation for the existing text location columns (leads,
     * customers, sales documents still store country/state/city strings).
     * Verifies the saved combination actually exists in the master and that
     * every child belongs to its parent — a city of Chennai district can
     * never be combined with Erode, even when the request is crafted by hand.
     * Unknown (free-text legacy) values stay allowed so historical records
     * keep saving unchanged.
     */
    @Transactional(readOnly = true)
    public ValidationResult validateNames(String country, String state, String district, String city) {
        String c = trimOrNull(country);
        if (c == null) {
            return new ValidationResult(true, null);
        }
        Country countryEntity = countryRepository.findByNameIgnoreCase(c).orElse(null);
        if (countryEntity == null) {
            // Legacy/free-text country (e.g. typed before the master existed).
            return new ValidationResult(true, null);
        }
        String s = trimOrNull(state);
        if (s == null) {
            return new ValidationResult(true, null);
        }
        StateRegion stateEntity = stateRepository
                .findByCountryIdAndNameIgnoreCase(countryEntity.getId(), s).orElse(null);
        if (stateEntity == null) {
            return new ValidationResult(false,
                    "State \"" + s + "\" does not exist in country \"" + c + "\" in the Location Master");
        }
        String d = trimOrNull(district);
        String ct = trimOrNull(city);
        if (ct == null) {
            return new ValidationResult(true, null);
        }
        // The city must exist under a district of THIS state.
        List<City> matches = cityRepository.searchByStateAndName(stateEntity.getId(), ct);
        if (matches.isEmpty()) {
            return new ValidationResult(true, null); // free-text legacy city — keep allowing
        }
        if (d != null) {
            District districtEntity = districtRepository
                    .findByStateIdAndNameOrAlias(stateEntity.getId(), d).orElse(null);
            if (districtEntity != null
                    && matches.stream().noneMatch(m -> m.getDistrict().getId().equals(districtEntity.getId()))) {
                return new ValidationResult(false,
                        "City \"" + ct + "\" does not belong to district \"" + d + "\"");
            }
        }
        return new ValidationResult(true, null);
    }

    // ========================= Country CRUD =========================

    @Transactional
    public CountryResponse createCountry(CountryRequest request) {
        String name = normalize(request.name());
        countryRepository.findByNameIgnoreCase(name).ifPresent(c -> {
            throw new BadRequestException("Country \"" + name + "\" already exists");
        });
        Country country = new Country();
        country.setName(name);
        country.setCode(trimOrNull(request.code()));
        country.setIsoCode(trimOrNull(request.isoCode()));
        country.setStatus(normalizeStatus(request.status()));
        country.setCreatedBy(currentUserName());
        Country saved = countryRepository.save(country);
        audit("Country Created", "countries", saved.getName(), null, saved.getStatus());
        return toResponse(saved);
    }

    @Transactional
    public CountryResponse updateCountry(Long id, CountryRequest request) {
        Country country = getCountry(id);
        String name = normalize(request.name());
        countryRepository.findByNameIgnoreCase(name)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw new BadRequestException("Country \"" + name + "\" already exists");
                });
        String previous = country.getName();
        country.setName(name);
        if (request.code() != null) country.setCode(trimOrNull(request.code()));
        if (request.isoCode() != null) country.setIsoCode(trimOrNull(request.isoCode()));
        if (request.status() != null && !request.status().isBlank()) {
            country.setStatus(normalizeStatus(request.status()));
        }
        country.setUpdatedBy(currentUserName());
        Country saved = countryRepository.save(country);
        audit("Country Updated", "countries", saved.getName(), previous, saved.getName());
        return toResponse(saved);
    }

    @Transactional
    public CountryResponse setCountryStatus(Long id, String status) {
        Country country = getCountry(id);
        String normalized = normalizeStatus(status);
        String previous = country.getStatus();
        country.setStatus(normalized);
        country.setUpdatedBy(currentUserName());
        Country saved = countryRepository.save(country);
        audit("Country " + ("Active".equals(normalized) ? "Activated" : "Deactivated"),
                "countries", saved.getName(), previous, normalized);
        return toResponse(saved);
    }

    /**
     * Hard delete is allowed ONLY for never-used rows. Any location referenced
     * by a Lead / Customer / Quotation / Contract / CPO / DC / Invoice must be
     * deactivated instead so historical records stay intact.
     */
    @Transactional
    public void deleteCountry(Long id) {
        Country country = getCountry(id);
        long usage = usageCount("country", country.getName());
        if (usage > 0) {
            throw new BadRequestException("\"" + country.getName() + "\" is used by " + usage
                    + " record(s). Deactivate it instead of deleting — existing records must keep displaying it.");
        }
        audit("Country Deleted", "countries", country.getName(), country.getName(), null);
        countryRepository.delete(country);
    }

    // ========================= State CRUD =========================

    @Transactional
    public StateResponse createState(Long countryId, StateRequest request) {
        Country country = getCountry(countryId);
        String name = normalize(request.name());
        stateRepository.findByCountryIdAndNameIgnoreCase(countryId, name).ifPresent(s -> {
            throw new BadRequestException("State \"" + name + "\" already exists in " + country.getName());
        });
        StateRegion state = new StateRegion();
        state.setCountry(country);
        state.setName(name);
        state.setCode(trimOrNull(request.code()));
        state.setStatus(normalizeStatus(request.status()));
        state.setCreatedBy(currentUserName());
        StateRegion saved = stateRepository.save(state);
        audit("State Created", "states", country.getName() + " / " + saved.getName(), null, saved.getStatus());
        return toResponse(saved);
    }

    @Transactional
    public StateResponse updateState(Long id, StateRequest request) {
        StateRegion state = getState(id);
        String name = normalize(request.name());
        stateRepository.findByCountryIdAndNameIgnoreCase(state.getCountry().getId(), name)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw new BadRequestException("State \"" + name + "\" already exists");
                });
        String previous = state.getName();
        state.setName(name);
        if (request.code() != null) state.setCode(trimOrNull(request.code()));
        if (request.status() != null && !request.status().isBlank()) {
            state.setStatus(normalizeStatus(request.status()));
        }
        state.setUpdatedBy(currentUserName());
        StateRegion saved = stateRepository.save(state);
        audit("State Updated", "states",
                saved.getCountry().getName() + " / " + saved.getName(), previous, saved.getName());
        return toResponse(saved);
    }

    @Transactional
    public StateResponse setStateStatus(Long id, String status) {
        StateRegion state = getState(id);
        String normalized = normalizeStatus(status);
        String previous = state.getStatus();
        state.setStatus(normalized);
        state.setUpdatedBy(currentUserName());
        StateRegion saved = stateRepository.save(state);
        audit("State " + ("Active".equals(normalized) ? "Activated" : "Deactivated"),
                "states", saved.getCountry().getName() + " / " + saved.getName(), previous, normalized);
        return toResponse(saved);
    }

    @Transactional
    public void deleteState(Long id) {
        StateRegion state = getState(id);
        if (districtRepository.countByStateId(id) > 0) {
            throw new BadRequestException("\"" + state.getName() + "\" still has districts. "
                    + "Deactivate it instead of deleting — existing records must keep displaying it.");
        }
        long usage = usageCount("state", state.getName());
        if (usage > 0) {
            throw new BadRequestException("\"" + state.getName() + "\" is used by " + usage
                    + " record(s). Deactivate it instead of deleting.");
        }
        audit("State Deleted", "states",
                state.getCountry().getName() + " / " + state.getName(), state.getName(), null);
        stateRepository.delete(state);
    }

    // ========================= District CRUD =========================

    @Transactional
    public DistrictResponse createDistrict(Long stateId, DistrictRequest request) {
        StateRegion state = getState(stateId);
        String name = normalize(request.name());
        districtRepository.findByStateIdAndNameIgnoreCase(stateId, name).ifPresent(d -> {
            throw new BadRequestException("District \"" + name + "\" already exists in " + state.getName());
        });
        District district = new District();
        district.setState(state);
        district.setName(name);
        district.setCode(trimOrNull(request.code()));
        district.setAliases(trimOrNull(request.aliases()));
        district.setStatus(normalizeStatus(request.status()));
        district.setCreatedBy(currentUserName());
        District saved = districtRepository.save(district);
        audit("District Created", "districts",
                state.getCountry().getName() + " / " + state.getName() + " / " + saved.getName(),
                null, saved.getStatus());
        return toResponse(saved);
    }

    @Transactional
    public DistrictResponse updateDistrict(Long id, DistrictRequest request) {
        District district = getDistrict(id);
        String name = normalize(request.name());
        districtRepository.findByStateIdAndNameIgnoreCase(district.getState().getId(), name)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw new BadRequestException("District \"" + name + "\" already exists");
                });
        String previous = district.getName();
        district.setName(name);
        if (request.code() != null) district.setCode(trimOrNull(request.code()));
        if (request.aliases() != null) district.setAliases(trimOrNull(request.aliases()));
        if (request.status() != null && !request.status().isBlank()) {
            district.setStatus(normalizeStatus(request.status()));
        }
        district.setUpdatedBy(currentUserName());
        District saved = districtRepository.save(district);
        audit("District Updated", "districts",
                saved.getState().getCountry().getName() + " / " + saved.getState().getName() + " / " + saved.getName(),
                previous, saved.getName());
        return toResponse(saved);
    }

    @Transactional
    public DistrictResponse setDistrictStatus(Long id, String status) {
        District district = getDistrict(id);
        String normalized = normalizeStatus(status);
        String previous = district.getStatus();
        district.setStatus(normalized);
        district.setUpdatedBy(currentUserName());
        District saved = districtRepository.save(district);
        audit("District " + ("Active".equals(normalized) ? "Activated" : "Deactivated"),
                "districts",
                saved.getState().getCountry().getName() + " / " + saved.getState().getName() + " / " + saved.getName(),
                previous, normalized);
        return toResponse(saved);
    }

    @Transactional
    public void deleteDistrict(Long id) {
        District district = getDistrict(id);
        if (cityRepository.countByDistrictId(id) > 0) {
            throw new BadRequestException("\"" + district.getName() + "\" still has cities/towns. "
                    + "Deactivate it instead of deleting — existing records must keep displaying it.");
        }
        audit("District Deleted", "districts",
                district.getState().getCountry().getName() + " / " + district.getState().getName() + " / " + district.getName(),
                district.getName(), null);
        districtRepository.delete(district);
    }

    // ========================= City CRUD =========================

    @Transactional
    public CityResponse createCity(Long districtId, CityRequest request) {
        District district = getDistrict(districtId);
        String name = normalize(request.name());
        cityRepository.findByDistrictIdAndNameIgnoreCase(districtId, name).ifPresent(c -> {
            throw new BadRequestException("City \"" + name + "\" already exists in " + district.getName());
        });
        City city = new City();
        city.setDistrict(district);
        city.setName(name);
        city.setCode(trimOrNull(request.code()));
        city.setStatus(normalizeStatus(request.status()));
        city.setCreatedBy(currentUserName());
        City saved = cityRepository.save(city);
        audit("City Created", "cities", fullPath(saved), null, saved.getStatus());
        return toResponse(saved);
    }

    @Transactional
    public CityResponse updateCity(Long id, CityRequest request) {
        City city = getCity(id);
        String name = normalize(request.name());
        cityRepository.findByDistrictIdAndNameIgnoreCase(city.getDistrict().getId(), name)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw new BadRequestException("City \"" + name + "\" already exists");
                });
        String previous = city.getName();
        city.setName(name);
        if (request.code() != null) city.setCode(trimOrNull(request.code()));
        if (request.status() != null && !request.status().isBlank()) {
            city.setStatus(normalizeStatus(request.status()));
        }
        city.setUpdatedBy(currentUserName());
        City saved = cityRepository.save(city);
        audit("City Updated", "cities", fullPath(saved), previous, saved.getName());
        return toResponse(saved);
    }

    @Transactional
    public CityResponse setCityStatus(Long id, String status) {
        City city = getCity(id);
        String normalized = normalizeStatus(status);
        String previous = city.getStatus();
        city.setStatus(normalized);
        city.setUpdatedBy(currentUserName());
        City saved = cityRepository.save(city);
        audit("City " + ("Active".equals(normalized) ? "Activated" : "Deactivated"),
                "cities", fullPath(saved), previous, normalized);
        return toResponse(saved);
    }

    @Transactional
    public void deleteCity(Long id) {
        City city = getCity(id);
        long usage = usageCount("city", city.getName());
        if (usage > 0) {
            throw new BadRequestException("\"" + city.getName() + "\" is used by " + usage
                    + " record(s). Deactivate it instead of deleting — existing records must keep displaying it.");
        }
        audit("City Deleted", "cities", fullPath(city), city.getName(), null);
        cityRepository.delete(city);
    }

    // ========================= Seeding + migration =========================

    @Transactional
    public void seedIfEmpty() {
        if (countryRepository.count() > 0) {
            log.info("Location master already seeded ({} countries) — checking for missing records", countryRepository.count());
            fixExistingData();
            return;
        }
        log.info("Seeding centralized location master ...");
        seedIndia();
        seedOtherCountries();
        log.info("Location master seeded: {} countries, {} states, {} districts, {} cities",
                countryRepository.count(), stateRepository.count(),
                districtRepository.count(), cityRepository.count());
    }

    /**
     * Runs on every start-up (and after any admin edit) and only ever ADDS what
     * is missing — a whole state, a district or a city. Nothing is deleted,
     * renamed or re-ordered, and countries an admin removed are not resurrected,
     * so the check is safe to repeat as often as the application restarts.
     */
    @Transactional
    public void fixExistingData() {
        log.info("Checking location master for missing states / districts / cities ...");
        migrateDistrictNames();
        countryRepository.findByNameIgnoreCase("India").ifPresent(this::syncIndia);
        for (Map.Entry<String, Map<String, List<String>>> countryEntry : OTHER_COUNTRY_CITIES.entrySet()) {
            String countryName = countryEntry.getKey().split("\\|")[0];
            countryRepository.findByNameIgnoreCase(countryName)
                    .ifPresent(country -> syncOtherCountry(country, countryEntry.getValue()));
        }
        log.info("Location data check complete: {} countries, {} states, {} districts, {} cities",
                countryRepository.count(), stateRepository.count(),
                districtRepository.count(), cityRepository.count());
    }

    /** Legacy district rename; kept because stored addresses still use the old label. */
    private void migrateDistrictNames() {
        Country india = countryRepository.findByNameIgnoreCase("India").orElse(null);
        if (india == null) {
            return;
        }
        StateRegion apState = stateRepository
                .findByCountryIdAndNameIgnoreCase(india.getId(), "Andhra Pradesh").orElse(null);
        if (apState == null) {
            return;
        }
        districtRepository.findByStateIdAndNameIgnoreCase(apState.getId(), "Anantapur").ifPresent(old -> {
            if (!"Anantapuramu".equals(old.getName())) {
                log.info("  Migrating district: Anantapur -> Anantapuramu (id={})", old.getId());
                old.setName("Anantapuramu");
                old.setAliases("Anantapur,Ananthapur,Ananthapuramu");
                districtRepository.save(old);
            }
        });
    }

    /** First-run seed: the India catalogue (country created only when absent). */
    private void seedIndia() {
        syncIndia(ensureCountry("India", "IN", "IND"));
    }

    /** Idempotent Country → State → District → City sync of the India catalogue. */
    private void syncIndia(Country india) {
        for (Map.Entry<String, Map<String, List<String>>> stateEntry : INDIA_STATE_DISTRICTS.entrySet()) {
            StateRegion state = ensureState(india, stateEntry.getKey());
            for (Map.Entry<String, List<String>> districtEntry : stateEntry.getValue().entrySet()) {
                District district = ensureDistrict(state, districtEntry.getKey(), true);
                for (String cityName : districtEntry.getValue()) {
                    ensureCity(district, cityName);
                }
            }
        }
    }

    /** First-run seed of the non-India ERP trading countries. */
    private void seedOtherCountries() {
        for (Map.Entry<String, Map<String, List<String>>> countryEntry : OTHER_COUNTRY_CITIES.entrySet()) {
            String[] parts = countryEntry.getKey().split("\\|");
            syncOtherCountry(ensureCountry(parts[0], parts[1], parts[2]), countryEntry.getValue());
        }
    }

    /**
     * Idempotent sync of one non-India country. Creating a missing STATE is the
     * important part: a database seeded by an older catalogue can hold a country
     * with no first-level divisions at all, and the previous check only ever
     * filled cities under states that already existed — so those countries could
     * never recover. Their cities live under a single "{State} District" row, the
     * same shape the first-run seed uses.
     */
    private void syncOtherCountry(Country country, Map<String, List<String>> stateMap) {
        for (Map.Entry<String, List<String>> stateEntry : stateMap.entrySet()) {
            StateRegion state = ensureState(country, stateEntry.getKey());
            if (stateEntry.getValue().isEmpty()) {
                continue;
            }
            District district = ensureDistrict(state, stateEntry.getKey() + " District", false);
            for (String cityName : stateEntry.getValue()) {
                ensureCity(district, cityName);
            }
        }
    }

    private Country ensureCountry(String name, String code, String isoCode) {
        return countryRepository.findByNameIgnoreCase(name).orElseGet(() -> {
            Country c = new Country();
            c.setName(name);
            c.setCode(code);
            c.setIsoCode(isoCode);
            c.setCreatedBy("system");
            log.info("  Added missing country: {}", name);
            return countryRepository.save(c);
        });
    }

    private StateRegion ensureState(Country country, String name) {
        return stateRepository.findByCountryIdAndNameIgnoreCase(country.getId(), name).orElseGet(() -> {
            StateRegion s = new StateRegion();
            s.setCountry(country);
            s.setName(name);
            s.setCreatedBy("system");
            log.info("  Added missing state: {} / {}", country.getName(), name);
            return stateRepository.save(s);
        });
    }

    private District ensureDistrict(StateRegion state, String name, boolean withAliases) {
        District district = districtRepository.findByStateIdAndNameIgnoreCase(state.getId(), name)
                .orElseGet(() -> {
                    District d = new District();
                    d.setState(state);
                    d.setName(name);
                    d.setCreatedBy("system");
                    log.info("  Added missing district: {} / {}", state.getName(), name);
                    return districtRepository.save(d);
                });
        if (!withAliases) {
            return district;
        }
        String aliases = DISTRICT_ALIASES.get(name);
        if (aliases != null && (district.getAliases() == null || district.getAliases().isBlank())) {
            district.setAliases(aliases);
            districtRepository.save(district);
        }
        return district;
    }

    private City ensureCity(District district, String name) {
        return cityRepository.findByDistrictIdAndNameIgnoreCase(district.getId(), name).orElseGet(() -> {
            City c = new City();
            c.setDistrict(district);
            c.setName(name);
            c.setCreatedBy("system");
            log.info("    Added missing city: {} / {} / {}", district.getState().getName(), district.getName(), name);
            return cityRepository.save(c);
        });
    }

    // ========================= Helpers =========================

    private Country getCountry(Long id) {
        return countryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Country not found with id: " + id));
    }

    private StateRegion getState(Long id) {
        return stateRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("State not found with id: " + id));
    }

    private District getDistrict(Long id) {
        return districtRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("District not found with id: " + id));
    }

    private City getCity(Long id) {
        return cityRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("City not found with id: " + id));
    }

    private String fullPath(City city) {
        District d = city.getDistrict();
        StateRegion s = d.getState();
        return s.getCountry().getName() + " / " + s.getName() + " / " + d.getName() + " / " + city.getName();
    }

    private boolean isActive(String status) {
        return status == null || status.isBlank() || "Active".equalsIgnoreCase(status.trim());
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) return "Active";
        String s = status.trim();
        if ("Inactive".equalsIgnoreCase(s) || "Disabled".equalsIgnoreCase(s)) return "Inactive";
        if ("Active".equalsIgnoreCase(s) || "Enabled".equalsIgnoreCase(s)) return "Active";
        throw new BadRequestException("Status must be Active or Inactive");
    }

    private String normalize(String value) {
        String clean = value == null ? "" : value.trim();
        if (clean.isEmpty()) {
            throw new BadRequestException("Name is required");
        }
        if (clean.length() > 120) {
            throw new BadRequestException("Name must be 120 characters or less");
        }
        return clean;
    }

    private String trimOrNull(String value) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.isEmpty() ? null : clean;
    }

    /** How many live ERP records reference this location (delete protection). */
    private long usageCount(String level, String value) {
        return switch (level) {
            case "country" -> leadRepository.countByCountryIgnoreCase(value)
                    + customerRepository.countByCountryIgnoreCase(value)
                    + quotationRepository.countByCountryIgnoreCase(value)
                    + invoiceRepository.countByBuyerCountryIgnoreCase(value);
            case "state" -> leadRepository.countByStateIgnoreCase(value)
                    + customerRepository.countByBillingStateIgnoreCase(value)
                    + quotationRepository.countByStateIgnoreCase(value)
                    + salesContractRepository.countByStateIgnoreCase(value)
                    + salesOrderRepository.countByStateIgnoreCase(value)
                    + deliveryChallanRepository.countByStateIgnoreCase(value)
                    + invoiceRepository.countByCompanyStateIgnoreCase(value);
            case "city" -> leadRepository.countByCityIgnoreCase(value)
                    + customerRepository.countByBillingCityIgnoreCase(value)
                    + quotationRepository.countByCityIgnoreCase(value)
                    + salesContractRepository.countByCityIgnoreCase(value)
                    + salesOrderRepository.countByCityIgnoreCase(value)
                    + deliveryChallanRepository.countByCityIgnoreCase(value);
            default -> 0L;
        };
    }

    private void audit(String action, String section, String fieldPath, String previous, String next) {
        try {
            auditRepository.save(new SettingsAuditLog(AUDIT_KEY, section, fieldPath, previous, next, currentUserName()));
        } catch (RuntimeException e) {
            // Audit is defence-in-depth; never block the mutation itself.
            log.warn("Failed to record location master audit '{}': {}", action, e.getMessage());
        }
    }

    private String currentUserName() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "system";
    }

    private CountryResponse toResponse(Country c) {
        return new CountryResponse(c.getId(), c.getName(), c.getCode(), c.getIsoCode(),
                c.getStatus(), c.getCreatedBy(),
                c.getCreatedAt() == null ? null : c.getCreatedAt().toString(),
                c.getUpdatedBy(),
                c.getUpdatedAt() == null ? null : c.getUpdatedAt().toString());
    }

    private StateResponse toResponse(StateRegion s) {
        return new StateResponse(s.getId(), s.getCountry().getId(), s.getCountry().getName(),
                s.getName(), s.getCode(), s.getStatus(), s.getCreatedBy(),
                s.getCreatedAt() == null ? null : s.getCreatedAt().toString(),
                s.getUpdatedBy(),
                s.getUpdatedAt() == null ? null : s.getUpdatedAt().toString());
    }

    private DistrictResponse toResponse(District d) {
        return new DistrictResponse(d.getId(), d.getState().getId(), d.getState().getName(),
                d.getName(), d.getCode(), d.getAliases(), d.getStatus(), d.getCreatedBy(),
                d.getCreatedAt() == null ? null : d.getCreatedAt().toString(),
                d.getUpdatedBy(),
                d.getUpdatedAt() == null ? null : d.getUpdatedAt().toString());
    }

    private CityResponse toResponse(City c) {
        District d = c.getDistrict();
        StateRegion s = d.getState();
        return new CityResponse(c.getId(), d.getId(), d.getName(), s.getName(), s.getCountry().getName(),
                c.getName(), c.getCode(), c.getStatus(), c.getCreatedBy(),
                c.getCreatedAt() == null ? null : c.getCreatedAt().toString(),
                c.getUpdatedBy(),
                c.getUpdatedAt() == null ? null : c.getUpdatedAt().toString());
    }

    // ========================= Seed data =========================

    /**
     * India state → { district → [cities] } — complete baseline dataset.
     * Uses {@code Map.ofEntries()} at the outer level and {@code HashMap} at the
     * inner level to allow duplicate-free construction without runtime overhead.
     */
    private static Map<String, Map<String, List<String>>> buildIndiaStateDistricts() {
        Map<String, Map<String, List<String>>> m = new java.util.LinkedHashMap<>();

        m.put("Andhra Pradesh", Map.ofEntries(
            Map.entry("Anantapuramu", List.of("Anantapuramu", "Hindupur", "Guntakal", "Kadiri", "Penukonda")),
            Map.entry("Chittoor", List.of("Chittoor", "Puttur", "Srikalahasti")),
            Map.entry("East Godavari", List.of("Kakinada", "Amalapuram", "Peddapuram")),
            Map.entry("Guntur", List.of("Guntur", "Tenali", "Mangalagiri", "Tadepalli")),
            Map.entry("Krishna", List.of("Machilipatnam", "Nuzvid", "Gudivada")),
            Map.entry("Kurnool", List.of("Kurnool", "Adoni", "Yemmiganur")),
            Map.entry("Nellore", List.of("Nellore", "Gudur", "Kavali", "Atmakur")),
            Map.entry("Prakasam", List.of("Ongole", "Chirala", "Kandukur")),
            Map.entry("Srikakulam", List.of("Srikakulam", "Amadalavalasa", "Palasa")),
            Map.entry("Visakhapatnam", List.of("Visakhapatnam", "Anakapalli", "Bheemunipatnam")),
            Map.entry("Vizianagaram", List.of("Vizianagaram", "Parvathipuram", "Salur")),
            Map.entry("West Godavari", List.of("Bhimavaram", "Tadepalligudem", "Narsapur", "Eluru")),
            Map.entry("YSR Kadapa", List.of("Kadapa", "Proddatur", "Jammalamadugu")),
            // New districts from 2022 AP reorganization
            Map.entry("NTR", List.of("Vijayawada")),
            Map.entry("Palnadu", List.of("Narsaraopet", "Sattenapalli")),
            Map.entry("Nandyal", List.of("Nandyal")),
            Map.entry("Tirupati", List.of("Tirupati")),
            Map.entry("Annamayya", List.of("Rayachoti")),
            Map.entry("Sri Sathya Sai", List.of("Puttaparthi")),
            Map.entry("Parvathipuram Manyam", List.of("Parvathipuram")),
            Map.entry("Alluri Sitharama Raju", List.of("Rajamahendravaram")),
            Map.entry("Tirupattur", List.of("Tirupattur"))
        ));

        m.put("Arunachal Pradesh", Map.ofEntries(
            Map.entry("Tawang", List.of("Tawang")),
            Map.entry("West Kameng", List.of("Bomdila")),
            Map.entry("East Kameng", List.of("Seppa")),
            Map.entry("Papum Pare", List.of("Itanagar", "Naharlagun")),
            Map.entry("Lower Subansiri", List.of("Ziro")),
            Map.entry("Upper Subansiri", List.of("Daporijo")),
            Map.entry("West Siang", List.of("Along")),
            Map.entry("East Siang", List.of("Pasighat")),
            Map.entry("Lower Dibang Valley", List.of("Roing")),
            Map.entry("Upper Dibang Valley", List.of("Anini")),
            Map.entry("Changlang", List.of("Changlang", "Namsai")),
            Map.entry("Tirap", List.of("Khonsa")),
            Map.entry("Longding", List.of("Longding"))
        ));

        m.put("Assam", Map.ofEntries(
            Map.entry("Kamrup", List.of("Guwahati", "Palasbari")),
            Map.entry("Kamrup Metropolitan", List.of("Guwahati")),
            Map.entry("Cachar", List.of("Silchar", "Karimganj", "Hailakandi")),
            Map.entry("Dibrugarh", List.of("Dibrugarh", "Tinsukia")),
            Map.entry("Jorhat", List.of("Jorhat", "Sivasagar", "Golaghat")),
            Map.entry("Nagaon", List.of("Nagaon", "Morigaon")),
            Map.entry("Sonitpur", List.of("Tezpur", "Dhemaji")),
            Map.entry("Goalpara", List.of("Goalpara", "Dhubri")),
            Map.entry("Barpeta", List.of("Barpeta", "Bongaigaon")),
            Map.entry("Karbi Anglong", List.of("Diphu")),
            Map.entry("Dima Hasao", List.of("Haflong")),
            Map.entry("Lakhimpur", List.of("North Lakhimpur"))
        ));

        m.put("Bihar", Map.ofEntries(
            Map.entry("Patna", List.of("Patna", "Bakhtiyarpur", "Barh")),
            Map.entry("Gaya", List.of("Gaya", "Bodh Gaya", "Bikramganj")),
            Map.entry("Nalanda", List.of("Bihar Sharif", "Rajgir", "Hilsa")),
            Map.entry("Muzaffarpur", List.of("Muzaffarpur", "Sitamarhi", "Sheohar")),
            Map.entry("East Champaran", List.of("Motihari", "Bettiah")),
            Map.entry("West Champaran", List.of("Bettiah", "Narkatiaganj")),
            Map.entry("Bhagalpur", List.of("Bhagalpur", "Naugachia")),
            Map.entry("Munger", List.of("Munger", "Jamalpur")),
            Map.entry("Darbhanga", List.of("Darbhanga", "Madhubani")),
            Map.entry("Vaishali", List.of("Hajipur", "Mahnar")),
            Map.entry("Saran", List.of("Chapra", "Gopalganj")),
            Map.entry("Siwan", List.of("Siwan")),
            Map.entry("Buxar", List.of("Buxar", "Ara")),
            Map.entry("Aurangabad", List.of("Aurangabad", "Daudnagar")),
            Map.entry("Nawada", List.of("Nawada")),
            Map.entry("Jamui", List.of("Jamui")),
            Map.entry("Kishanganj", List.of("Kishanganj")),
            Map.entry("Araria", List.of("Araria", "Forbesganj")),
            Map.entry("Purnia", List.of("Purnia", "Katihar")),
            Map.entry("Supaul", List.of("Supaul")),
            Map.entry("Madhepura", List.of("Madhepura")),
            Map.entry("Saharsa", List.of("Saharsa"))
        ));

        m.put("Chhattisgarh", Map.ofEntries(
            Map.entry("Raipur", List.of("Raipur", "Arang", "Abhanpur")),
            Map.entry("Durg", List.of("Durg", "Bhilai")),
            Map.entry("Bilaspur", List.of("Bilaspur", "Bhatapara", "Takhatpur")),
            Map.entry("Korba", List.of("Korba")),
            Map.entry("Rajnandgaon", List.of("Rajnandgaon", "Dongargarh")),
            Map.entry("Ambikapur", List.of("Ambikapur")),
            Map.entry("Raigarh", List.of("Raigarh", "Sarangarh")),
            Map.entry("Janjgir-Champa", List.of("Janjgir", "Champa")),
            Map.entry("Kabirdham", List.of("Kawardha")),
            Map.entry("Mahasamund", List.of("Mahasamund")),
            Map.entry("Bastar", List.of("Jagdalpur")),
            Map.entry("Dantewada", List.of("Dantewada")),
            Map.entry("Kondagaon", List.of("Kondagaon")),
            Map.entry("Gariaband", List.of("Gariaband")),
            Map.entry("Baloda Bazar", List.of("Baloda Bazar")),
            Map.entry("Bemetara", List.of("Bemetara")),
            Map.entry("Mungeli", List.of("Mungeli")),
            Map.entry("Surguja", List.of("Surajpur")),
            Map.entry("Korea", List.of("Baikunthpur"))
        ));

        m.put("Goa", Map.ofEntries(
            Map.entry("North Goa", List.of("Panaji", "Mapusa", "Ponda", "Bicholim", "Calangute")),
            Map.entry("South Goa", List.of("Margao", "Vasco da Gama", "Quepem"))
        ));

        m.put("Gujarat", Map.ofEntries(
            Map.entry("Ahmedabad", List.of("Ahmedabad", "Gandhinagar", "Sanand", "Dholka")),
            Map.entry("Surat", List.of("Surat", "Bardoli", "Navsari", "Valsad")),
            Map.entry("Vadodara", List.of("Vadodara", "Anand", "Nadiad")),
            Map.entry("Rajkot", List.of("Rajkot", "Gondal", "Morbi", "Jetpur")),
            Map.entry("Bhavnagar", List.of("Bhavnagar", "Palitana", "Talaja")),
            Map.entry("Jamnagar", List.of("Jamnagar")),
            Map.entry("Junagadh", List.of("Junagadh", "Veraval", "Mangrol")),
            Map.entry("Kutch", List.of("Bhuj", "Anjar", "Gandhidham")),
            Map.entry("Panchmahal", List.of("Godhra", "Halol")),
            Map.entry("Banaskantha", List.of("Palanpur", "Deesa")),
            Map.entry("Mehsana", List.of("Mehsana", "Unjha", "Visnagar")),
            Map.entry("Sabarkantha", List.of("Himmatnagar")),
            Map.entry("Kheda", List.of("Nadiad")),
            Map.entry("Bharuch", List.of("Bharuch", "Ankleshwar")),
            Map.entry("Narmada", List.of("Rajpipla")),
            Map.entry("Dangs", List.of("Ahwa")),
            Map.entry("Tapi", List.of("Vyara", "Songadh")),
            Map.entry("Amreli", List.of("Amreli", "Savarkundla")),
            Map.entry("Surendranagar", List.of("Surendranagar", "Wadhwan")),
            Map.entry("Porbandar", List.of("Porbandar")),
            Map.entry("Gir Somnath", List.of("Somnath"))
        ));

        m.put("Haryana", Map.ofEntries(
            Map.entry("Faridabad", List.of("Faridabad", "Ballabgarh")),
            Map.entry("Gurugram", List.of("Gurugram", "Sohna", "Manesar")),
            Map.entry("Panipat", List.of("Panipat", "Samalkha")),
            Map.entry("Ambala", List.of("Ambala", "Ambala Cantt")),
            Map.entry("Karnal", List.of("Karnal", "Nilokheri", "Indri")),
            Map.entry("Sonipat", List.of("Sonipat", "Ganaur")),
            Map.entry("Rohtak", List.of("Rohtak", "Bahadurgarh", "Jhajjar")),
            Map.entry("Hisar", List.of("Hisar", "Hansi", "Narnaul")),
            Map.entry("Jind", List.of("Jind", "Safidon")),
            Map.entry("Kurukshetra", List.of("Kurukshetra", "Thanesar", "Pehowa")),
            Map.entry("Sirsa", List.of("Sirsa", "Dabwali")),
            Map.entry("Mahendragarh", List.of("Narnaul")),
            Map.entry("Yamunanagar", List.of("Yamunanagar", "Sadhaura")),
            Map.entry("Panchkula", List.of("Panchkula", "Pinjore")),
            Map.entry("Mewat", List.of("Nuh", "Ferozepur Jhirka")),
            Map.entry("Palwal", List.of("Palwal", "Hodal")),
            Map.entry("Bhiwani", List.of("Bhiwani", "Loharu")),
            Map.entry("Charkhi Dadri", List.of("Charkhi Dadri")),
            Map.entry("Kaithal", List.of("Kaithal", "Cheeka")),
            Map.entry("Rewari", List.of("Rewari", "Dharuhera"))
        ));

        m.put("Himachal Pradesh", Map.ofEntries(
            Map.entry("Shimla", List.of("Shimla", "Theog", "Kufri", "Chopal")),
            Map.entry("Kangra", List.of("Dharamshala", "Kangra", "Palampur")),
            Map.entry("Mandi", List.of("Mandi", "Sundernagar")),
            Map.entry("Solan", List.of("Solan", "Parwanoo", "Baddi")),
            Map.entry("Kullu", List.of("Kullu", "Manali", "Bhuntar")),
            Map.entry("Hamirpur", List.of("Hamirpur", "Sujanpur")),
            Map.entry("Bilaspur", List.of("Bilaspur", "Naina Devi")),
            Map.entry("Una", List.of("Una", "Gagret")),
            Map.entry("Chamba", List.of("Chamba", "Dalhousie", "Khajjiar")),
            Map.entry("Lahaul and Spiti", List.of("Keylong", "Kaza")),
            Map.entry("Kinnaur", List.of("Reckong Peo", "Kalpa")),
            Map.entry("Sirmaur", List.of("Nahan", "Paonta Sahib"))
        ));

        m.put("Jharkhand", Map.ofEntries(
            Map.entry("Ranchi", List.of("Ranchi", "Kanke", "Namkum")),
            Map.entry("East Singhbhum", List.of("Jamshedpur", "Chakradharpur")),
            Map.entry("Dhanbad", List.of("Dhanbad", "Jharia", "Sindri")),
            Map.entry("Bokaro", List.of("Bokaro Steel City", "Chas")),
            Map.entry("Deoghar", List.of("Deoghar", "Madhupur", "Jasidih")),
            Map.entry("Hazaribag", List.of("Hazaribag", "Chatra")),
            Map.entry("Giridih", List.of("Giridih", "Madhuban")),
            Map.entry("Dumka", List.of("Dumka", "Jamtara")),
            Map.entry("Godda", List.of("Godda")),
            Map.entry("Sahebganj", List.of("Sahebganj", "Rajmahal")),
            Map.entry("Palamu", List.of("Daltonganj", "Medininagar")),
            Map.entry("Latehar", List.of("Latehar")),
            Map.entry("Gumla", List.of("Gumla")),
            Map.entry("Lohardaga", List.of("Lohardaga")),
            Map.entry("Simdega", List.of("Simdega")),
            Map.entry("Khunti", List.of("Khunti")),
            Map.entry("Seraikela-Kharsawan", List.of("Seraikela", "Chaibasa")),
            Map.entry("Pakur", List.of("Pakur")),
            Map.entry("Ramgarh", List.of("Ramgarh", "Koderma"))
        ));

        m.put("Karnataka", Map.ofEntries(
            Map.entry("Bengaluru Urban", List.of("Bengaluru", "Yelahanka", "Electronic City", "Whitefield")),
            Map.entry("Bengaluru Rural", List.of("Devanahalli", "Nelamangala", "Ramanagara")),
            Map.entry("Mysuru", List.of("Mysuru", "Hunsur", "Nanjangud")),
            Map.entry("Hubli-Dharwad", List.of("Hubballi", "Dharwad")),
            Map.entry("Mangaluru", List.of("Mangaluru", "Udupi", "Manipal")),
            Map.entry("Belagavi", List.of("Belagavi", "Chikkodi", "Gokak")),
            Map.entry("Davangere", List.of("Davangere", "Harihar", "Chitradurga")),
            Map.entry("Ballari", List.of("Ballari", "Hospet", "Sandur")),
            Map.entry("Kalaburagi", List.of("Kalaburagi", "Yadgir", "Aland")),
            Map.entry("Vijayapura", List.of("Vijayapura", "Indi")),
            Map.entry("Raichur", List.of("Raichur", "Mantralayam")),
            Map.entry("Bidar", List.of("Bidar", "Humnabad", "Basavakalyan")),
            Map.entry("Haveri", List.of("Haveri", "Ranebennur")),
            Map.entry("Shivamogga", List.of("Shivamogga", "Bhadravati", "Sagara")),
            Map.entry("Tumakuru", List.of("Tumakuru", "Tiptur")),
            Map.entry("Mandya", List.of("Mandya", "Srirangapatna")),
            Map.entry("Hassan", List.of("Hassan", "Arsikere")),
            Map.entry("Chikkamagaluru", List.of("Chikkamagaluru", "Kadur")),
            Map.entry("Kodagu", List.of("Madikeri", "Somvarpet")),
            Map.entry("Dakshina Kannada", List.of("Mangaluru", "Puttur")),
            Map.entry("Udupi", List.of("Udupi", "Kundapura", "Karkala")),
            Map.entry("Gadag", List.of("Gadag")),
            Map.entry("Bagalkot", List.of("Bagalkot", "Badami")),
            Map.entry("Chamarajanagar", List.of("Chamarajanagar", "Gundlupet")),
            Map.entry("Kolar", List.of("Kolar", "Bangarpet")),
            Map.entry("Chikkaballapura", List.of("Chikkaballapura")),
            Map.entry("Vijayanagara", List.of("Hospet"))
        ));

        m.put("Kerala", Map.ofEntries(
            Map.entry("Thiruvananthapuram", List.of("Thiruvananthapuram", "Neyyattinkara", "Attingal", "Nedumangad")),
            Map.entry("Ernakulam", List.of("Kochi", "Aluva", "Perumbavoor", "Muvattupuzha")),
            Map.entry("Kozhikode", List.of("Kozhikode", "Vadakara", "Koyilandy")),
            Map.entry("Thrissur", List.of("Thrissur", "Chalakudy", "Kodungallur")),
            Map.entry("Alappuzha", List.of("Alappuzha", "Cherthala", "Kayamkulam")),
            Map.entry("Kollam", List.of("Kollam", "Punalur", "Karunagappally")),
            Map.entry("Palakkad", List.of("Palakkad", "Ottapalam", "Chittur")),
            Map.entry("Kottayam", List.of("Kottayam", "Pala", "Kanjirapally", "Changanassery")),
            Map.entry("Malappuram", List.of("Malappuram", "Manjeri", "Perinthalmanna", "Tirur")),
            Map.entry("Kannur", List.of("Kannur", "Thalassery", "Mattannur")),
            Map.entry("Kasaragod", List.of("Kasaragod", "Kanhangad")),
            Map.entry("Idukki", List.of("Thodupuzha", "Munnar", "Adoor")),
            Map.entry("Wayanad", List.of("Kalpetta", "Sulthan Bathery")),
            Map.entry("Pathanamthitta", List.of("Pathanamthitta", "Pandalam"))
        ));

        m.put("Madhya Pradesh", Map.ofEntries(
            Map.entry("Bhopal", List.of("Bhopal", "Sehore")),
            Map.entry("Indore", List.of("Indore", "Mhow")),
            Map.entry("Jabalpur", List.of("Jabalpur", "Katni", "Narsinghpur")),
            Map.entry("Gwalior", List.of("Gwalior", "Dabra", "Datia")),
            Map.entry("Ujjain", List.of("Ujjain", "Agar Malwa")),
            Map.entry("Sagar", List.of("Sagar", "Damoh", "Panna")),
            Map.entry("Satna", List.of("Satna", "Maihar")),
            Map.entry("Rewa", List.of("Rewa")),
            Map.entry("Dhar", List.of("Dhar", "Manawar")),
            Map.entry("Chhindwara", List.of("Chhindwara", "Pandhurna")),
            Map.entry("Balaghat", List.of("Balaghat")),
            Map.entry("Betul", List.of("Betul", "Multai")),
            Map.entry("Vidisha", List.of("Vidisha", "Sironj")),
            Map.entry("Harda", List.of("Harda")),
            Map.entry("Hoshangabad", List.of("Hoshangabad", "Itarsi")),
            Map.entry("Narsinghpur", List.of("Narsinghpur", "Gadarwara")),
            Map.entry("Rajgarh", List.of("Rajgarh")),
            Map.entry("Shajapur", List.of("Shajapur", "Shujalpur")),
            Map.entry("Shivpuri", List.of("Shivpuri", "Karera")),
            Map.entry("Tikamgarh", List.of("Tikamgarh")),
            Map.entry("Chhatarpur", List.of("Chhatarpur")),
            Map.entry("Datia", List.of("Datia")),
            Map.entry("Dindori", List.of("Dindori")),
            Map.entry("East Nimar", List.of("Khandwa")),
            Map.entry("Jhabua", List.of("Jhabua")),
            Map.entry("Katni", List.of("Katni")),
            Map.entry("Mandla", List.of("Mandla")),
            Map.entry("Morena", List.of("Morena")),
            Map.entry("Neemuch", List.of("Neemuch", "Mandsaur")),
            Map.entry("Ratlam", List.of("Ratlam")),
            Map.entry("Seoni", List.of("Seoni")),
            Map.entry("Shahdol", List.of("Shahdol", "Anuppur")),
            Map.entry("Sidhi", List.of("Sidhi")),
            Map.entry("Umaria", List.of("Umaria")),
            Map.entry("West Nimar", List.of("Khargone", "Barwani"))
        ));

        m.put("Maharashtra", Map.ofEntries(
            Map.entry("Mumbai City", List.of("Mumbai", "Fort", "Colaba", "Churchgate")),
            Map.entry("Mumbai Suburban", List.of("Andheri", "Bandra", "Borivali", "Kurla", "Goregaon")),
            Map.entry("Thane", List.of("Thane", "Kalyan", "Dombivli", "Ulhasnagar")),
            Map.entry("Pune", List.of("Pune", "Pimpri", "Chinchwad", "Hadapsar", "Hinjewadi")),
            Map.entry("Nagpur", List.of("Nagpur", "Kamptee", "Hingna")),
            Map.entry("Nashik", List.of("Nashik", "Malegaon", "Sinnar", "Igatpuri")),
            Map.entry("Ahmednagar", List.of("Ahmednagar", "Sangamner")),
            Map.entry("Solapur", List.of("Solapur", "Akkalkot", "Pandharpur")),
            Map.entry("Kolhapur", List.of("Kolhapur", "Ichalkaranji")),
            Map.entry("Amravati", List.of("Amravati", "Badnera", "Achalpur")),
            Map.entry("Satara", List.of("Satara", "Karad", "Mahabaleshwar")),
            Map.entry("Sangli", List.of("Sangli", "Miraj", "Tasgaon")),
            Map.entry("Jalgaon", List.of("Jalgaon", "Bhusawal", "Pachora")),
            Map.entry("Chandrapur", List.of("Chandrapur", "Ballarpur")),
            Map.entry("Akola", List.of("Akola", "Washim")),
            Map.entry("Jalna", List.of("Jalna", "Partur")),
            Map.entry("Latur", List.of("Latur", "Udgir")),
            Map.entry("Osmanabad", List.of("Osmanabad", "Tuljapur")),
            Map.entry("Raigad", List.of("Alibag", "Pen", "Mangaon")),
            Map.entry("Ratnagiri", List.of("Ratnagiri", "Chiplun")),
            Map.entry("Sindhudurg", List.of("Sawantwadi", "Malvan")),
            Map.entry("Bhandara", List.of("Bhandara", "Tumsar")),
            Map.entry("Gondia", List.of("Gondia")),
            Map.entry("Wardha", List.of("Wardha", "Hinganghat")),
            Map.entry("Yavatmal", List.of("Yavatmal", "Wani")),
            Map.entry("Buldhana", List.of("Buldhana", "Khamgaon")),
            Map.entry("Dhule", List.of("Dhule", "Shirpur")),
            Map.entry("Nandurbar", List.of("Nandurbar", "Shahada")),
            Map.entry("Hingoli", List.of("Hingoli", "Basmath")),
            Map.entry("Parbhani", List.of("Parbhani", "Gangakhed")),
            Map.entry("Beed", List.of("Beed", "Georai")),
            Map.entry("Dharashiv", List.of("Dharashiv"))
        ));

        m.put("Manipur", Map.ofEntries(
            Map.entry("Imphal West", List.of("Imphal", "Lamphelpat", "Wangoi")),
            Map.entry("Imphal East", List.of("Porompat", "Heingang")),
            Map.entry("Bishnupur", List.of("Bishnupur")),
            Map.entry("Thoubal", List.of("Thoubal", "Lilong")),
            Map.entry("Churachandpur", List.of("Churachandpur")),
            Map.entry("Senapati", List.of("Senapati")),
            Map.entry("Tamenglong", List.of("Tamenglong")),
            Map.entry("Ukhrul", List.of("Ukhrul")),
            Map.entry("Chandel", List.of("Chandel")),
            Map.entry("Jiribam", List.of("Jiribam")),
            Map.entry("Noney", List.of("Noney")),
            Map.entry("Pherzawl", List.of("Pherzawl")),
            Map.entry("Kakching", List.of("Kakching")),
            Map.entry("Tengnoupal", List.of("Tengnoupal")),
            Map.entry("Kamjong", List.of("Kamjong"))
        ));

        m.put("Meghalaya", Map.ofEntries(
            Map.entry("East Khasi Hills", List.of("Shillong", "Nongpoh")),
            Map.entry("West Khasi Hills", List.of("Nongstoin")),
            Map.entry("South West Khasi Hills", List.of("Mawkyrwat")),
            Map.entry("East Garo Hills", List.of("Tura", "Resubelpara")),
            Map.entry("West Garo Hills", List.of("Ampati")),
            Map.entry("South Garo Hills", List.of("Baghmara")),
            Map.entry("North Garo Hills", List.of("Hajong")),
            Map.entry("Jaintia Hills", List.of("Jowai")),
            Map.entry("East Jaintia Hills", List.of("Khliehriat")),
            Map.entry("Ri-Bhoi", List.of("Nongpoh"))
        ));

        m.put("Mizoram", Map.ofEntries(
            Map.entry("Aizawl", List.of("Aizawl", "Sairang")),
            Map.entry("Lunglei", List.of("Lunglei", "Hnahthial")),
            Map.entry("Champhai", List.of("Champhai")),
            Map.entry("Kolasib", List.of("Kolasib")),
            Map.entry("Lawngtlai", List.of("Lawngtlai")),
            Map.entry("Mamit", List.of("Mamit")),
            Map.entry("Saitual", List.of("Saitual")),
            Map.entry("Serchhip", List.of("Serchhip"))
        ));

        m.put("Nagaland", Map.ofEntries(
            Map.entry("Kohima", List.of("Kohima", "Chumoukedima")),
            Map.entry("Dimapur", List.of("Dimapur", "Medziphema")),
            Map.entry("Mokokchung", List.of("Mokokchung", "Impur")),
            Map.entry("Tuensang", List.of("Tuensang")),
            Map.entry("Wokha", List.of("Wokha")),
            Map.entry("Zunheboto", List.of("Zunheboto")),
            Map.entry("Mon", List.of("Mon", "Longwa")),
            Map.entry("Phek", List.of("Phek")),
            Map.entry("Longleng", List.of("Longleng")),
            Map.entry("Kiphire", List.of("Kiphire")),
            Map.entry("Peren", List.of("Peren")),
            Map.entry("Noklak", List.of("Noklak"))
        ));

        m.put("Odisha", Map.ofEntries(
            Map.entry("Khordha", List.of("Bhubaneswar", "Khordha", "Jatni")),
            Map.entry("Cuttack", List.of("Cuttack", "Jagatsinghpur")),
            Map.entry("Ganjam", List.of("Berhampur", "Chhatrapur")),
            Map.entry("Sundergarh", List.of("Rourkela", "Bisra")),
            Map.entry("Mayurbhanj", List.of("Baripada", "Keonjhar")),
            Map.entry("Balasore", List.of("Balasore", "Bhadrak")),
            Map.entry("Bolangir", List.of("Bolangir", "Patnagarh")),
            Map.entry("Sambalpur", List.of("Sambalpur", "Hirakud")),
            Map.entry("Puri", List.of("Puri", "Konark")),
            Map.entry("Koraput", List.of("Koraput", "Jeypore")),
            Map.entry("Dhenkanal", List.of("Dhenkanal", "Kamakhyanagar")),
            Map.entry("Angul", List.of("Angul", "Talcher")),
            Map.entry("Jharsuguda", List.of("Jharsuguda")),
            Map.entry("Nabarangapur", List.of("Nabarangapur", "Umerkote")),
            Map.entry("Rayagada", List.of("Rayagada", "Gunupur")),
            Map.entry("Gajapati", List.of("Paralakhemundi")),
            Map.entry("Kandhamal", List.of("Phulbani")),
            Map.entry("Nuapada", List.of("Nuapada")),
            Map.entry("Bargarh", List.of("Bargarh")),
            Map.entry("Debagarh", List.of("Debagarh")),
            Map.entry("Malkangiri", List.of("Malkangiri")),
            Map.entry("Nayagarh", List.of("Nayagarh")),
            Map.entry("Subarnapur", List.of("Subarnapur"))
        ));

        m.put("Punjab", Map.ofEntries(
            Map.entry("Ludhiana", List.of("Ludhiana", "Khanna", "Raikot")),
            Map.entry("Amritsar", List.of("Amritsar", "Tarn Taran")),
            Map.entry("Jalandhar", List.of("Jalandhar", "Phagwara")),
            Map.entry("Patiala", List.of("Patiala", "Rajpura", "Nabha")),
            Map.entry("Bathinda", List.of("Bathinda")),
            Map.entry("Mohali", List.of("Mohali", "Kharar")),
            Map.entry("Pathankot", List.of("Pathankot")),
            Map.entry("Hoshiarpur", List.of("Hoshiarpur", "Mukerian")),
            Map.entry("Gurdaspur", List.of("Gurdaspur", "Batala")),
            Map.entry("Kapurthala", List.of("Kapurthala")),
            Map.entry("Sangrur", List.of("Sangrur", "Sunam")),
            Map.entry("Ferozepur", List.of("Ferozepur", "Zira")),
            Map.entry("Moga", List.of("Moga")),
            Map.entry("Rupnagar", List.of("Rupnagar", "Anandpur Sahib")),
            Map.entry("Fazilka", List.of("Fazilka", "Abohar")),
            Map.entry("Muktsar", List.of("Sri Muktsar Sahib", "Malout")),
            Map.entry("Faridkot", List.of("Faridkot", "Kotkapura")),
            Map.entry("Barnala", List.of("Barnala")),
            Map.entry("Mansa", List.of("Mansa", "Budhlada"))
        ));

        m.put("Rajasthan", Map.ofEntries(
            Map.entry("Jaipur", List.of("Jaipur", "Shahpura", "Chomu")),
            Map.entry("Jodhpur", List.of("Jodhpur", "Bilara", "Phalodi")),
            Map.entry("Udaipur", List.of("Udaipur", "Gangapur")),
            Map.entry("Kota", List.of("Kota", "Bundi", "Baran")),
            Map.entry("Bikaner", List.of("Bikaner", "Nokha")),
            Map.entry("Ajmer", List.of("Ajmer", "Kishangarh", "Beawar")),
            Map.entry("Bhilwara", List.of("Bhilwara", "Mandal")),
            Map.entry("Alwar", List.of("Alwar", "Bharatpur")),
            Map.entry("Sri Ganganagar", List.of("Sri Ganganagar", "Hanumangarh")),
            Map.entry("Pali", List.of("Pali")),
            Map.entry("Churu", List.of("Churu", "Ratangarh")),
            Map.entry("Dungarpur", List.of("Dungarpur", "Banswara")),
            Map.entry("Jhunjhunu", List.of("Jhunjhunu", "Nawalgarh")),
            Map.entry("Nagaur", List.of("Nagaur", "Merta")),
            Map.entry("Rajsamand", List.of("Rajsamand", "Nathdwara")),
            Map.entry("Sawai Madhopur", List.of("Sawai Madhopur", "Karauli")),
            Map.entry("Sikar", List.of("Sikar", "Fatehpur")),
            Map.entry("Tonk", List.of("Tonk")),
            Map.entry("Chittorgarh", List.of("Chittorgarh", "Rawatbhata")),
            Map.entry("Dausa", List.of("Dausa")),
            Map.entry("Jalore", List.of("Jalore", "Bhinmal")),
            Map.entry("Barmer", List.of("Barmer", "Balotra")),
            Map.entry("Hanumangarh", List.of("Hanumangarh", "Sangaria")),
            Map.entry("Karauli", List.of("Karauli")),
            Map.entry("Pratapgarh", List.of("Pratapgarh")),
            Map.entry("Sirohi", List.of("Sirohi", "Abu Road"))
        ));

        m.put("Sikkim", Map.ofEntries(
            Map.entry("East Sikkim", List.of("Gangtok", "Rangpo", "Singtam")),
            Map.entry("West Sikkim", List.of("Gyalshing", "Pelling")),
            Map.entry("North Sikkim", List.of("Mangan", "Chungthang")),
            Map.entry("South Sikkim", List.of("Namchi", "Ravangla")),
            Map.entry("Pakyong", List.of("Pakyong")),
            Map.entry("Soreng", List.of("Soreng"))
        ));

        m.put("Tamil Nadu", Map.ofEntries(
            Map.entry("Ariyalur", List.of("Ariyalur", "Udayarpalayam")),
            Map.entry("Chengalpattu", List.of("Chengalpattu", "Tambaram", "Tiruporur")),
            Map.entry("Chennai", List.of("Chennai", "Ambattur", "Avadi", "Tambaram", "Madhavaram", "Sholinganallur")),
            Map.entry("Coimbatore", List.of("Coimbatore", "Pollachi", "Mettupalayam", "Sathyamangalam")),
            Map.entry("Cuddalore", List.of("Cuddalore", "Chidambaram", "Virudhachalam")),
            Map.entry("Dharmapuri", List.of("Dharmapuri", "Palacode", "Pennagaram")),
            Map.entry("Dindigul", List.of("Dindigul", "Palani", "Oddanchatram")),
            Map.entry("Erode", List.of("Erode", "Gobichettipalayam", "Bhavani", "Perundurai")),
            Map.entry("Kallakurichi", List.of("Kallakurichi", "Ulundurpet")),
            Map.entry("Kancheepuram", List.of("Kancheepuram", "Sriperumbudur", "Kundrathur")),
            Map.entry("Kanniyakumari", List.of("Nagercoil", "Thuckalay", "Colachel")),
            Map.entry("Karur", List.of("Karur", "Kulithalai")),
            Map.entry("Krishnagiri", List.of("Krishnagiri", "Hosur")),
            Map.entry("Madurai", List.of("Madurai", "Usilampatti", "Thirumangalam", "Melur")),
            Map.entry("Mayiladuthurai", List.of("Mayiladuthurai", "Kuthalam")),
            Map.entry("Nagapattinam", List.of("Nagapattinam")),
            Map.entry("Namakkal", List.of("Namakkal", "Rasipuram", "Tiruchengode")),
            Map.entry("Perambalur", List.of("Perambalur", "Kunnam")),
            Map.entry("Pudukkottai", List.of("Pudukkottai", "Aranthangi")),
            Map.entry("Ramanathapuram", List.of("Ramanathapuram", "Paramakudi")),
            Map.entry("Ranipet", List.of("Ranipet", "Arakkonam", "Katpadi")),
            Map.entry("Salem", List.of("Salem", "Mettur", "Omalur", "Yercaud")),
            Map.entry("Sivaganga", List.of("Sivaganga", "Karaikudi")),
            Map.entry("Tenkasi", List.of("Tenkasi", "Courtallam", "Sankarankovil")),
            Map.entry("Thanjavur", List.of("Thanjavur", "Kumbakonam")),
            Map.entry("Theni", List.of("Theni", "Bodinayakanur")),
            Map.entry("Thoothukudi", List.of("Thoothukudi", "Kovilpatti")),
            Map.entry("Tiruchirappalli", List.of("Tiruchirappalli", "Srirangam", "Manapparai", "Lalgudi")),
            Map.entry("Tirunelveli", List.of("Tirunelveli", "Palayamkottai", "Ambasamudram")),
            Map.entry("Tirupathur", List.of("Tirupathur", "Ambur", "Vaniyambadi")),
            Map.entry("Tiruppur", List.of("Tiruppur", "Palladam", "Udumalaipettai", "Kangeyam")),
            Map.entry("Tiruvallur", List.of("Tiruvallur", "Poonamallee", "Gummidipoondi")),
            Map.entry("Tiruvannamalai", List.of("Tiruvannamalai", "Arani", "Cheyyar")),
            Map.entry("Tiruvarur", List.of("Tiruvarur", "Mannargudi")),
            Map.entry("Vellore", List.of("Vellore", "Katpadi", "Gudiyatham")),
            Map.entry("Viluppuram", List.of("Viluppuram", "Tindivanam")),
            Map.entry("Virudhunagar", List.of("Virudhunagar", "Sivakasi", "Rajapalayam", "Aruppukkottai"))
        ));

        m.put("Telangana", Map.ofEntries(
            Map.entry("Hyderabad", List.of("Hyderabad", "Secunderabad", "Malkajgiri", "LB Nagar")),
            Map.entry("Rangareddy", List.of("Shamshabad", "Kondapur", "Miyapur", "Uppal")),
            Map.entry("Medchal-Malkajgiri", List.of("Malkajgiri", "Kukatpally", "Quthbullapur")),
            Map.entry("Warangal Urban", List.of("Warangal", "Hanamkonda")),
            Map.entry("Warangal Rural", List.of("Wardhannapet", "Narsampet")),
            Map.entry("Nizamabad", List.of("Nizamabad", "Bodhan", "Armoor")),
            Map.entry("Karimnagar", List.of("Karimnagar", "Huzurabad")),
            Map.entry("Khammam", List.of("Khammam", "Kothagudem")),
            Map.entry("Nalgonda", List.of("Nalgonda", "Miryalaguda", "Suryapet")),
            Map.entry("Mahbubnagar", List.of("Mahbubnagar", "Jadcherla")),
            Map.entry("Adilabad", List.of("Adilabad", "Nirmal", "Mancherial")),
            Map.entry("Medak", List.of("Medak", "Sangareddy", "Zaheerabad")),
            Map.entry("Siddipet", List.of("Siddipet", "Dubbaka")),
            Map.entry("Jagtial", List.of("Jagtial")),
            Map.entry("Peddapalli", List.of("Peddapalli", "Ramagundam")),
            Map.entry("Vikarabad", List.of("Vikarabad", "Tandur")),
            Map.entry("Nagarkurnool", List.of("Nagarkurnool")),
            Map.entry("Wanaparthy", List.of("Wanaparthy")),
            Map.entry("Kamareddy", List.of("Kamareddy")),
            Map.entry("Rajanna Sircilla", List.of("Sircilla")),
            Map.entry("Jangaon", List.of("Jangaon")),
            Map.entry("Mulugu", List.of("Mulugu")),
            Map.entry("Narayanpet", List.of("Narayanpet")),
            Map.entry("Jogulamba Gadwal", List.of("Gadwal"))
        ));

        m.put("Tripura", Map.ofEntries(
            Map.entry("West Tripura", List.of("Agartala", "Sonamura", "Bishalgarh")),
            Map.entry("Sepahijala", List.of("Khowai")),
            Map.entry("Gomati", List.of("Udaipur", "Amarpur")),
            Map.entry("South Tripura", List.of("Belonia", "Santirbazar")),
            Map.entry("North Tripura", List.of("Dharmanagar", "Kailashahar")),
            Map.entry("Unakoti", List.of("Kailashahar")),
            Map.entry("Khowai", List.of("Khowai")),
            Map.entry("Dhalai", List.of("Ambassa"))
        ));

        m.put("Uttar Pradesh", Map.ofEntries(
            Map.entry("Lucknow", List.of("Lucknow", "Barabanki", "Malihabad")),
            Map.entry("Kanpur Nagar", List.of("Kanpur")),
            Map.entry("Agra", List.of("Agra", "Firozabad", "Mathura")),
            Map.entry("Varanasi", List.of("Varanasi", "Chandauli", "Ghazipur")),
            Map.entry("Prayagraj", List.of("Prayagraj", "Phulpur")),
            Map.entry("Ghaziabad", List.of("Ghaziabad", "Indirapuram")),
            Map.entry("Noida", List.of("Noida", "Greater Noida", "Dadri")),
            Map.entry("Meerut", List.of("Meerut", "Muzaffarnagar", "Hapur")),
            Map.entry("Bareilly", List.of("Bareilly", "Budaun", "Shahjahanpur")),
            Map.entry("Aligarh", List.of("Aligarh", "Hathras", "Kasganj")),
            Map.entry("Moradabad", List.of("Moradabad", "Amroha")),
            Map.entry("Jhansi", List.of("Jhansi", "Lalitpur", "Orai")),
            Map.entry("Gorakhpur", List.of("Gorakhpur", "Deoria")),
            Map.entry("Azamgarh", List.of("Azamgarh", "Mau", "Ballia")),
            Map.entry("Basti", List.of("Basti", "Siddharthnagar")),
            Map.entry("Faizabad", List.of("Faizabad", "Ayodhya")),
            Map.entry("Ambedkar Nagar", List.of("Akbarpur", "Tanda")),
            Map.entry("Bahraich", List.of("Bahraich", "Nanpara")),
            Map.entry("Gonda", List.of("Gonda", "Balrampur")),
            Map.entry("Sultanpur", List.of("Sultanpur")),
            Map.entry("Pratapgarh", List.of("Pratapgarh")),
            Map.entry("Rae Bareli", List.of("Rae Bareli")),
            Map.entry("Amethi", List.of("Amethi")),
            Map.entry("Sitapur", List.of("Sitapur", "Biswan")),
            Map.entry("Hardoi", List.of("Hardoi", "Shahabad")),
            Map.entry("Unnao", List.of("Unnao")),
            Map.entry("Kanpur Dehat", List.of("Akbarpur")),
            Map.entry("Jalaun", List.of("Orai", "Kalpi")),
            Map.entry("Hamirpur", List.of("Hamirpur")),
            Map.entry("Mahoba", List.of("Mahoba")),
            Map.entry("Chitrakoot", List.of("Chitrakoot", "Karvi")),
            Map.entry("Banda", List.of("Banda")),
            Map.entry("Mahrajganj", List.of("Mahrajganj")),
            Map.entry("Saharanpur", List.of("Saharanpur", "Deoband")),
            Map.entry("Muzaffarnagar", List.of("Muzaffarnagar", "Khatauli")),
            Map.entry("Bijnor", List.of("Bijnor", "Najibabad")),
            Map.entry("Rampur", List.of("Rampur")),
            Map.entry("Sambhal", List.of("Sambhal", "Chandausi")),
            Map.entry("Pilibhit", List.of("Pilibhit", "Puranpur")),
            Map.entry("Lakhimpur Kheri", List.of("Lakhimpur")),
            Map.entry("Kushinagar", List.of("Kushinagar", "Hata")),
            Map.entry("Bhadohi", List.of("Bhadohi")),
            Map.entry("Mirzapur", List.of("Mirzapur", "Chunar")),
            Map.entry("Sonbhadra", List.of("Robertsganj", "Renukoot")),
            Map.entry("Jaunpur", List.of("Jaunpur", "Shahganj"))
        ));

        m.put("Uttarakhand", Map.ofEntries(
            Map.entry("Dehradun", List.of("Dehradun", "Mussoorie", "Rishikesh")),
            Map.entry("Haridwar", List.of("Haridwar", "Roorkee", "Laksar")),
            Map.entry("Nainital", List.of("Nainital", "Haldwani", "Ramnagar")),
            Map.entry("Almora", List.of("Almora", "Ranikhet")),
            Map.entry("Udham Singh Nagar", List.of("Rudrapur", "Kashipur")),
            Map.entry("Tehri Garhwal", List.of("New Tehri", "Chamba")),
            Map.entry("Pauri Garhwal", List.of("Pauri", "Kotdwar")),
            Map.entry("Chamoli", List.of("Gopeshwar", "Joshimath")),
            Map.entry("Uttarkashi", List.of("Uttarkashi", "Barkot")),
            Map.entry("Pithoragarh", List.of("Pithoragarh", "Munsiari")),
            Map.entry("Champawat", List.of("Champawat", "Tanakpur")),
            Map.entry("Bageshwar", List.of("Bageshwar")),
            Map.entry("Rudraprayag", List.of("Rudraprayag", "Guptkashi"))
        ));

        m.put("West Bengal", Map.ofEntries(
            Map.entry("Kolkata", List.of("Kolkata", "Bally", "Serampore")),
            Map.entry("Howrah", List.of("Howrah", "Uluberia")),
            Map.entry("North 24 Parganas", List.of("Baranagar", "Barrackpore", "Bangaon", "Basirhat")),
            Map.entry("South 24 Parganas", List.of("Alipore", "Diamond Harbour", "Canning")),
            Map.entry("Hooghly", List.of("Chinsurah", "Bandel", "Arambag")),
            Map.entry("Bardhaman", List.of("Bardhaman", "Durgapur", "Asansol")),
            Map.entry("Murshidabad", List.of("Berhampore", "Jangipur")),
            Map.entry("Nadia", List.of("Krishnanagar", "Ranaghat", "Kalyani")),
            Map.entry("Birbhum", List.of("Suri", "Bolpur", "Rampurhat")),
            Map.entry("Malda", List.of("Malda", "English Bazar")),
            Map.entry("Dakshin Dinajpur", List.of("Balurghat")),
            Map.entry("Uttar Dinajpur", List.of("Raiganj")),
            Map.entry("Jalpaiguri", List.of("Jalpaiguri", "Alipurduar")),
            Map.entry("Cooch Behar", List.of("Cooch Behar")),
            Map.entry("Darjeeling", List.of("Darjeeling", "Kurseong", "Mirik")),
            Map.entry("Purulia", List.of("Purulia")),
            Map.entry("Bankura", List.of("Bankura", "Bishnupur")),
            Map.entry("Paschim Medinipur", List.of("Midnapore", "Kharagpur")),
            Map.entry("Purba Medinipur", List.of("Tamluk", "Haldia"))
        ));

        m.put("Andaman and Nicobar Islands", Map.ofEntries(
            Map.entry("South Andaman", List.of("Port Blair", "Ferrargunj")),
            Map.entry("North and Middle Andaman", List.of("Mayabunder", "Diglipur")),
            Map.entry("Nicobar", List.of("Car Nicobar", "Nancowry"))
        ));

        m.put("Chandigarh", Map.of(
            "Chandigarh", List.of("Chandigarh", "Manimajra", "Daria")
        ));

        m.put("Dadra and Nagar Haveli and Daman and Diu", Map.ofEntries(
            Map.entry("Dadra and Nagar Haveli", List.of("Silvassa", "Vapi")),
            Map.entry("Daman", List.of("Daman")),
            Map.entry("Diu", List.of("Diu"))
        ));

        m.put("Delhi", Map.ofEntries(
            Map.entry("New Delhi", List.of("New Delhi", "Connaught Place", "Nehru Place")),
            Map.entry("Central Delhi", List.of("Daryaganj", "Karol Bagh", "Paharganj")),
            Map.entry("North Delhi", List.of("Civil Lines", "Kamla Nagar", "Model Town")),
            Map.entry("South Delhi", List.of("Saket", "Lajpat Nagar", "Hauz Khas")),
            Map.entry("West Delhi", List.of("Rajouri Garden", "Janakpuri", "Dwarka")),
            Map.entry("East Delhi", List.of("Shahdara", "Preet Vihar", "Mayur Vihar")),
            Map.entry("North West Delhi", List.of("Rohini", "Shalimar Bagh", "Pitampura")),
            Map.entry("South West Delhi", List.of("Vasant Kunj", "Najafgarh")),
            Map.entry("North East Delhi", List.of("Seelampur", "Gandhi Nagar")),
            Map.entry("Shahdara", List.of("Shahdara", "GTB Nagar"))
        ));

        m.put("Jammu and Kashmir", Map.ofEntries(
            Map.entry("Srinagar", List.of("Srinagar", "Budgam")),
            Map.entry("Jammu", List.of("Jammu", "Kathua", "Udhampur", "Samba")),
            Map.entry("Anantnag", List.of("Anantnag", "Kokernag")),
            Map.entry("Baramulla", List.of("Baramulla", "Sopore")),
            Map.entry("Budgam", List.of("Chadoora")),
            Map.entry("Kupwara", List.of("Kupwara", "Handwara")),
            Map.entry("Pulwama", List.of("Pulwama", "Awantipora")),
            Map.entry("Bandipora", List.of("Bandipora", "Sumbal")),
            Map.entry("Ganderbal", List.of("Ganderbal", "Kangan")),
            Map.entry("Kulgam", List.of("Kulgam")),
            Map.entry("Shopian", List.of("Shopian")),
            Map.entry("Doda", List.of("Doda", "Bhaderwah")),
            Map.entry("Kishtwar", List.of("Kishtwar")),
            Map.entry("Ramban", List.of("Ramban")),
            Map.entry("Reasi", List.of("Reasi")),
            Map.entry("Poonch", List.of("Poonch")),
            Map.entry("Rajouri", List.of("Rajouri", "Nowshera"))
        ));

        m.put("Ladakh", Map.ofEntries(
            Map.entry("Leh", List.of("Leh", "Nubra")),
            Map.entry("Kargil", List.of("Kargil", "Drass"))
        ));

        m.put("Lakshadweep", Map.of(
            "Lakshadweep", List.of("Kavaratti", "Agatti", "Minicoy", "Andrott")
        ));

        m.put("Puducherry", Map.ofEntries(
            Map.entry("Puducherry", List.of("Puducherry", "Ozhukarai")),
            Map.entry("Karaikal", List.of("Karaikal")),
            Map.entry("Yanam", List.of("Yanam")),
            Map.entry("Mahe", List.of("Mahe"))
        ));

        return m;
    }

    private static final Map<String, Map<String, List<String>>> INDIA_STATE_DISTRICTS = buildIndiaStateDistricts();

    /** Canonical district name → comma-separated aliases for search matching. */
    private static final Map<String, String> DISTRICT_ALIASES = java.util.Map.ofEntries(
            Map.entry("Anantapuramu", "Anantapur,Ananthapur,Ananthapuramu"),
            Map.entry("Chittoor", "Chittor,Chitor"),
            Map.entry("NTR", "Ntr,Vijayawada"),
            Map.entry("YSR Kadapa", "Ysr Kadapa,Kadapa,Cuddapah"),
            Map.entry("East Godavari", "East Godavari,Peddapuram"),
            Map.entry("West Godavari", "West Godavari,Eluru"),
            Map.entry("Sri Sathya Sai", "Sri Sathya Sai,Puttaparthi,Saty Sai"),
            Map.entry("Alluri Sitharama Raju", "Alluri Sitharama Raju,Rajamahendravaram,Rajahmundry"),
            Map.entry("Parvathipuram Manyam", "Parvathipuram Manyam,Parvathipuram")
    );

    /** Other ERP trading countries: "countryName|code|isoCode" → { state → [cities] }. */
    private static final Map<String, Map<String, List<String>>> OTHER_COUNTRY_CITIES = Map.ofEntries(
        Map.entry("United States|US|USA", Map.ofEntries(
            Map.entry("Alabama", List.of("Birmingham", "Montgomery", "Mobile", "Huntsville")),
            Map.entry("Alaska", List.of("Anchorage", "Juneau", "Fairbanks")),
            Map.entry("Arizona", List.of("Phoenix", "Tucson", "Mesa", "Scottsdale")),
            Map.entry("Arkansas", List.of("Little Rock", "Fayetteville", "Fort Smith")),
            Map.entry("California", List.of("Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Fresno")),
            Map.entry("Colorado", List.of("Denver", "Colorado Springs", "Aurora")),
            Map.entry("Connecticut", List.of("Bridgeport", "Hartford", "New Haven", "Stamford")),
            Map.entry("Delaware", List.of("Wilmington", "Dover", "Newark")),
            Map.entry("Florida", List.of("Miami", "Orlando", "Jacksonville", "Tampa", "Fort Lauderdale")),
            Map.entry("Georgia", List.of("Atlanta", "Augusta", "Columbus", "Savannah")),
            Map.entry("Hawaii", List.of("Honolulu", "Hilo", "Kailua")),
            Map.entry("Idaho", List.of("Boise", "Meridian", "Nampa")),
            Map.entry("Illinois", List.of("Chicago", "Aurora", "Naperville", "Rockford")),
            Map.entry("Indiana", List.of("Indianapolis", "Fort Wayne", "Evansville")),
            Map.entry("Iowa", List.of("Des Moines", "Cedar Rapids", "Davenport")),
            Map.entry("Kansas", List.of("Wichita", "Topeka", "Kansas City", "Overland Park")),
            Map.entry("Kentucky", List.of("Louisville", "Lexington", "Bowling Green")),
            Map.entry("Louisiana", List.of("New Orleans", "Baton Rouge", "Shreveport")),
            Map.entry("Maine", List.of("Portland", "Lewiston", "Bangor")),
            Map.entry("Maryland", List.of("Baltimore", "Columbia", "Germantown", "Rockville")),
            Map.entry("Massachusetts", List.of("Boston", "Worcester", "Springfield", "Cambridge")),
            Map.entry("Michigan", List.of("Detroit", "Grand Rapids", "Warren", "Ann Arbor")),
            Map.entry("Minnesota", List.of("Minneapolis", "Saint Paul", "Rochester", "Bloomington")),
            Map.entry("Mississippi", List.of("Jackson", "Gulfport", "Southaven")),
            Map.entry("Missouri", List.of("Kansas City", "Saint Louis", "Springfield", "Columbia")),
            Map.entry("Montana", List.of("Billings", "Missoula", "Great Falls")),
            Map.entry("Nebraska", List.of("Omaha", "Lincoln", "Bellevue")),
            Map.entry("Nevada", List.of("Las Vegas", "Reno", "Henderson", "Sparks")),
            Map.entry("New Hampshire", List.of("Manchester", "Nashua", "Concord")),
            Map.entry("New Jersey", List.of("Newark", "Jersey City", "Paterson", "Elizabeth")),
            Map.entry("New Mexico", List.of("Albuquerque", "Las Cruces", "Santa Fe")),
            Map.entry("New York", List.of("New York City", "Buffalo", "Rochester", "Syracuse")),
            Map.entry("North Carolina", List.of("Charlotte", "Raleigh", "Greensboro", "Durham")),
            Map.entry("North Dakota", List.of("Fargo", "Bismarck", "Grand Forks")),
            Map.entry("Ohio", List.of("Columbus", "Cleveland", "Cincinnati", "Toledo")),
            Map.entry("Oklahoma", List.of("Oklahoma City", "Tulsa", "Norman")),
            Map.entry("Oregon", List.of("Portland", "Salem", "Eugene", "Bend")),
            Map.entry("Pennsylvania", List.of("Philadelphia", "Pittsburgh", "Allentown", "Erie")),
            Map.entry("Rhode Island", List.of("Providence", "Warwick", "Cranston")),
            Map.entry("South Carolina", List.of("Columbia", "Charleston", "Greenville", "Myrtle Beach")),
            Map.entry("South Dakota", List.of("Sioux Falls", "Rapid City", "Aberdeen")),
            Map.entry("Tennessee", List.of("Nashville", "Memphis", "Knoxville", "Chattanooga")),
            Map.entry("Texas", List.of("Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso")),
            Map.entry("Utah", List.of("Salt Lake City", "Provo", "West Valley City", "Ogden")),
            Map.entry("Vermont", List.of("Burlington", "Montpelier", "Rutland")),
            Map.entry("Virginia", List.of("Virginia Beach", "Norfolk", "Richmond", "Arlington")),
            Map.entry("Washington", List.of("Seattle", "Spokane", "Tacoma", "Bellevue")),
            Map.entry("West Virginia", List.of("Charleston", "Huntington", "Morgantown")),
            Map.entry("Wisconsin", List.of("Milwaukee", "Madison", "Green Bay", "Kenosha")),
            Map.entry("Wyoming", List.of("Cheyenne", "Casper", "Laramie"))
        )),
        Map.entry("United Kingdom|GB|GBR", Map.of(
            "England", List.of("London", "Manchester", "Birmingham", "Liverpool", "Leeds", "Bristol", "Sheffield", "Newcastle upon Tyne"),
            "Scotland", List.of("Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness"),
            "Wales", List.of("Cardiff", "Swansea", "Newport", "Wrexham"),
            "Northern Ireland", List.of("Belfast", "Derry", "Lisburn", "Newry")
        )),
        Map.entry("Canada|CA|CAN", Map.of(
            "Alberta", List.of("Calgary", "Edmonton", "Red Deer", "Lethbridge"),
            "British Columbia", List.of("Vancouver", "Victoria", "Surrey", "Burnaby", "Kelowna"),
            "Manitoba", List.of("Winnipeg", "Brandon", "Steinbach"),
            "New Brunswick", List.of("Moncton", "Saint John", "Fredericton"),
            "Newfoundland and Labrador", List.of("St. John's", "Mount Pearl", "Corner Brook"),
            "Nova Scotia", List.of("Halifax", "Sydney", "Dartmouth"),
            "Ontario", List.of("Toronto", "Ottawa", "Mississauga", "Hamilton", "London"),
            "Prince Edward Island", List.of("Charlottetown", "Summerside"),
            "Quebec", List.of("Montreal", "Quebec City", "Laval", "Gatineau"),
            "Saskatchewan", List.of("Saskatoon", "Regina", "Prince Albert")
        )),
        Map.entry("Australia|AU|AUS", Map.of(
            "New South Wales", List.of("Sydney", "Newcastle", "Wollongong", "Central Coast"),
            "Victoria", List.of("Melbourne", "Geelong", "Ballarat", "Bendigo"),
            "Queensland", List.of("Brisbane", "Gold Coast", "Cairns", "Townsville"),
            "Western Australia", List.of("Perth", "Fremantle", "Albany", "Bunbury"),
            "South Australia", List.of("Adelaide", "Mount Gambier", "Whyalla", "Port Augusta"),
            "Tasmania", List.of("Hobart", "Launceston", "Devonport", "Burnie"),
            "Australian Capital Territory", List.of("Canberra"),
            "Northern Territory", List.of("Darwin", "Alice Springs", "Palmerston")
        )),
        Map.entry("Germany|DE|DEU", Map.of(
            "Bavaria", List.of("Munich", "Nuremberg", "Augsburg", "Regensburg"),
            "Berlin", List.of("Berlin"),
            "Hamburg", List.of("Hamburg"),
            "North Rhine-Westphalia", List.of("Cologne", "Dusseldorf", "Dortmund", "Essen", "Duisburg"),
            "Baden-Wurttemberg", List.of("Stuttgart", "Mannheim", "Karlsruhe", "Freiburg"),
            "Hesse", List.of("Frankfurt", "Wiesbaden", "Kassel", "Darmstadt"),
            "Lower Saxony", List.of("Hanover", "Bremen", "Braunschweig", "Osnabruck"),
            "Rhineland-Palatinate", List.of("Mainz", "Koblenz", "Ludwigshafen"),
            "Schleswig-Holstein", List.of("Kiel", "Lubeck", "Flensburg"),
            "Saxony", List.of("Dresden", "Leipzig", "Chemnitz")
        )),
        Map.entry("Singapore|SG|SGP", Map.of(
            "Central", List.of("Marina Bay", "Orchard", "CBD"),
            "East", List.of("Tampines", "Pasir Ris", "Changi"),
            "North", List.of("Woodlands", "Yishun", "Sembawang"),
            "West", List.of("Jurong", "Bukit Batok", "Clementi"),
            "North-East", List.of("Hougang", "Serangoon", "Punggol")
        )),
        // The seven emirates of the United Arab Emirates. Each city belongs to its
        // own emirate: an older catalogue listed Sharjah under Abu Dhabi and Ajman
        // under Sharjah, which are not valid parent relationships.
        Map.entry("UAE|AE|ARE", Map.of(
            "Abu Dhabi", List.of("Abu Dhabi", "Al Ain", "Ruwais"),
            "Dubai", List.of("Dubai", "Jumeirah", "Deira", "Bur Dubai"),
            "Sharjah", List.of("Sharjah", "Khor Fakkan", "Kalba"),
            "Ajman", List.of("Ajman"),
            "Umm Al Quwain", List.of("Umm Al Quwain"),
            "Ras Al Khaimah", List.of("Ras Al Khaimah"),
            "Fujairah", List.of("Fujairah")
        )),
        Map.entry("Saudi Arabia|SA|SAU", Map.of(
            "Riyadh", List.of("Riyadh", "Al Kharj", "Duruma"),
            "Makkah", List.of("Mecca", "Jeddah", "Taif"),
            "Eastern Province", List.of("Dammam", "Khobar", "Dhahran", "Jubail"),
            "Medina", List.of("Medina", "Yanbu"),
            "Asir", List.of("Abha", "Khamis Mushait"),
            "Tabuk", List.of("Tabuk"),
            "Jizan", List.of("Jizan"),
            "Hail", List.of("Hail"),
            "Qassim", List.of("Buraidah", "Unaizah")
        )),
        Map.entry("Japan|JP|JPN", Map.of(
            "Tokyo", List.of("Tokyo", "Shinjuku", "Shibuya", "Chiyoda"),
            "Osaka", List.of("Osaka", "Sakai", "Higashiosaka"),
            "Kanagawa", List.of("Yokohama", "Kawasaki", "Sagamihara"),
            "Aichi", List.of("Nagoya", "Toyota", "Okazaki"),
            "Hokkaido", List.of("Sapporo", "Asahikawa", "Hakodate"),
            "Fukuoka", List.of("Fukuoka", "Kitakyushu"),
            "Kyoto", List.of("Kyoto", "Uji"),
            "Hyogo", List.of("Kobe", "Himeji", "Nishinomiya"),
            "Saitama", List.of("Saitama", "Kawaguchi", "Omiya"),
            "Chiba", List.of("Chiba", "Funabashi", "Ichikawa")
        )),
        Map.entry("China|CN|CHN", Map.of(
            "Beijing", List.of("Beijing", "Chaoyang", "Haidian"),
            "Shanghai", List.of("Shanghai", "Pudong", "Jing'an"),
            "Guangdong", List.of("Guangzhou", "Shenzhen", "Dongguan", "Foshan"),
            "Zhejiang", List.of("Hangzhou", "Ningbo", "Wenzhou"),
            "Jiangsu", List.of("Nanjing", "Suzhou", "Wuxi", "Changzhou"),
            "Sichuan", List.of("Chengdu", "Mianyang", "Deyang"),
            "Hubei", List.of("Wuhan", "Yichang", "Xiangyang"),
            "Fujian", List.of("Fuzhou", "Xiamen", "Quanzhou"),
            "Shandong", List.of("Jinan", "Qingdao", "Yantai"),
            "Henan", List.of("Zhengzhou", "Luoyang", "Kaifeng")
        )),
        Map.entry("Brazil|BR|BRA", Map.of(
            "Sao Paulo", List.of("Sao Paulo", "Campinas", "Santos", "Guarulhos"),
            "Rio de Janeiro", List.of("Rio de Janeiro", "Niteroi", "Campos dos Goytacazes"),
            "Minas Gerais", List.of("Belo Horizonte", "Uberlandia", "Contagem"),
            "Bahia", List.of("Salvador", "Feira de Santana", "Vitoria da Conquista"),
            "Parana", List.of("Curitiba", "Londrina", "Maringa"),
            "Rio Grande do Sul", List.of("Porto Alegre", "Caxias do Sul", "Pelotas"),
            "Pernambuco", List.of("Recife", "Jaboatao", "Olinda"),
            "Ceara", List.of("Fortaleza", "Juazeiro do Norte", "Sobral"),
            "Goias", List.of("Goiania", "Aparecida de Goiania"),
            "Espirito Santo", List.of("Vitoria", "Vila Velha", "Serra")
        )),
        Map.entry("France|FR|FRA", Map.of(
            "Ile-de-France", List.of("Paris", "Boulogne-Billancourt", "Saint-Denis"),
            "Provence-Alpes-Cote d'Azur", List.of("Marseille", "Nice", "Toulon", "Cannes"),
            "Auvergne-Rhone-Alpes", List.of("Lyon", "Grenoble", "Saint-Etienne", "Clermont-Ferrand"),
            "Hauts-de-France", List.of("Lille", "Amiens", "Roubaix"),
            "Nouvelle-Aquitaine", List.of("Bordeaux", "Limoges", "Poitiers"),
            "Occitanie", List.of("Toulouse", "Montpellier", "Perpignan"),
            "Grand Est", List.of("Strasbourg", "Mulhouse", "Metz", "Reims"),
            "Pays de la Loire", List.of("Nantes", "Angers", "Le Mans")
        )),
        Map.entry("Italy|IT|ITA", Map.of(
            "Lazio", List.of("Rome", "Latina", "Frosinone"),
            "Lombardy", List.of("Milan", "Brescia", "Bergamo", "Monza"),
            "Campania", List.of("Naples", "Salerno", "Caserta"),
            "Veneto", List.of("Venice", "Verona", "Padua", "Vicenza"),
            "Emilia-Romagna", List.of("Bologna", "Modena", "Parma", "Reggio Emilia"),
            "Tuscany", List.of("Florence", "Pisa", "Siena", "Livorno"),
            "Piedmont", List.of("Turin", "Novara", "Alessandria"),
            "Sicily", List.of("Palermo", "Catania", "Messina"),
            "Apulia", List.of("Bari", "Lecce", "Taranto")
        )),
        Map.entry("Netherlands|NL|NLD", Map.of(
            "North Holland", List.of("Amsterdam", "Haarlem", "Zaanstad"),
            "South Holland", List.of("Rotterdam", "The Hague", "Dordrecht", "Leiden"),
            "North Brabant", List.of("Eindhoven", "Tilburg", "Breda"),
            "Utrecht", List.of("Utrecht", "Amersfoort"),
            "Gelderland", List.of("Nijmegen", "Arnhem", "Apeldoorn")
        )),
        Map.entry("South Africa|ZA|ZAF", Map.of(
            "Gauteng", List.of("Johannesburg", "Pretoria", "Sandton", "Centurion"),
            "Western Cape", List.of("Cape Town", "Stellenbosch", "George"),
            "KwaZulu-Natal", List.of("Durban", "Pietermaritzburg", "Richards Bay"),
            "Eastern Cape", List.of("Port Elizabeth", "East London", "Grahamstown"),
            "Free State", List.of("Bloemfontein", "Welkom"),
            "Limpopo", List.of("Polokwane", "Thohoyandou"),
            "Mpumalanga", List.of("Nelspruit", "Witbank"),
            "North West", List.of("Rustenburg", "Mahikeng"),
            "Northern Cape", List.of("Kimberley", "Upington")
        )),
        Map.entry("Malaysia|MY|MYS", Map.of(
            "Kuala Lumpur", List.of("Kuala Lumpur", "Bukit Bintang", "Cheras"),
            "Selangor", List.of("Petaling Jaya", "Shah Alam", "Subang Jaya", "Klang"),
            "Penang", List.of("George Town", "Butterworth", "Bukit Mertajam"),
            "Johor", List.of("Johor Bahru", "Skudai", "Batu Pahat"),
            "Perak", List.of("Ipoh", "Taiping", "Manjung"),
            "Kedah", List.of("Alor Setar", "Sungai Petani"),
            "Kelantan", List.of("Kota Bharu", "Kuala Krai"),
            "Pahang", List.of("Kuantan", "Temerloh", "Cameron Highlands"),
            "Negeri Sembilan", List.of("Seremban", "Nilai"),
            "Melaka", List.of("Melaka", "Alor Gajah")
        )),
        Map.entry("Indonesia|ID|IDN", Map.of(
            "Jakarta", List.of("Jakarta", "Central Jakarta", "South Jakarta", "West Jakarta"),
            "West Java", List.of("Bandung", "Bogor", "Bekasi", "Karawang"),
            "East Java", List.of("Surabaya", "Malang", "Sidoarjo", "Madiun"),
            "Central Java", List.of("Semarang", "Solo", "Pekalongan"),
            "Bali", List.of("Denpasar", "Badung", "Gianyar"),
            "North Sumatra", List.of("Medan", "Binjai", "Pematangsiantar"),
            "South Sulawesi", List.of("Makassar", "Gowa", "Takalar"),
            "Riau", List.of("Pekanbaru", "Dumai"),
            "South Sumatra", List.of("Palembang", "Prabumulih"),
            "Lampung", List.of("Bandar Lampung", "Metro")
        )),
        Map.entry("Thailand|TH|THA", Map.of(
            "Bangkok", List.of("Bangkok", "Chatuchak", "Bang Rak", "Phra Nakhon"),
            "Chon Buri", List.of("Pattaya", "Chon Buri", "Si Racha"),
            "Phuket", List.of("Phuket", "Patong"),
            "Chiang Mai", List.of("Chiang Mai", "Chiang Rai"),
            "Nonthaburi", List.of("Nonthaburi", "Pak Kret"),
            "Chiang Rai", List.of("Chiang Rai", "Mae Sai"),
            "Khon Kaen", List.of("Khon Kaen"),
            "Nakhon Ratchasima", List.of("Nakhon Ratchasima", "Pak Chong"),
            "Hat Yai", List.of("Hat Yai", "Songkhla")
        ))
    );
}
