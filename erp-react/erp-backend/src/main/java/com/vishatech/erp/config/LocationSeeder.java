package com.vishatech.erp.config;

import com.vishatech.erp.service.LocationMasterService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Seeds the centralized Location Master (Country → State → District → City)
 * once, on first boot against an empty master. Idempotent: when countries
 * already exist the seed is skipped entirely, so restarts and redeploys never
 * duplicate or reset location data.
 */
@Component
public class LocationSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LocationSeeder.class);

    private final LocationMasterService locationMasterService;

    public LocationSeeder(LocationMasterService locationMasterService) {
        this.locationMasterService = locationMasterService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            locationMasterService.seedIfEmpty();
        } catch (RuntimeException e) {
            // Never block application startup on seeding (e.g. migration
            // locks); the admin can re-trigger it by truncating the tables.
            log.error("Location master seeding failed: {}", e.getMessage(), e);
        }
    }
}
