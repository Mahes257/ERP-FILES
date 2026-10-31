package com.vishatech.erp.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.GridConfig;
import com.vishatech.erp.repository.GridConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Grid column configuration store — persistence for the ERP's editable /
 * manageable / resizable grids.
 *
 * One row per grid key in {@code grid_configs}; the value is the exact column
 * array the user configured (order, labels, types, visibility, widths and
 * custom column definitions). Values are JSON, so adding a custom column never
 * triggers a dynamic ALTER TABLE. localStorage is never the source of truth.
 *
 * Keyed by grid (not by user), so every user of a module sees the same managed
 * columns. Configuration is readable and writable by any authenticated user —
 * the module's grids are not ADMIN-gated.
 *
 * Architecture: Controller → Service → Repository; transaction boundaries
 * live here.
 */
@Service
public class GridConfigService {

    private final GridConfigRepository gridConfigRepository;
    private final ObjectMapper objectMapper;

    public GridConfigService(GridConfigRepository gridConfigRepository, ObjectMapper objectMapper) {
        this.gridConfigRepository = gridConfigRepository;
        this.objectMapper = objectMapper;
    }

    /** Stored config, or {@code null} when the grid has never been configured. */
    @Transactional(readOnly = true)
    public JsonNode read(String key) {
        return gridConfigRepository.findByGridKey(key)
                .map(GridConfig::getConfigJson)
                .map(value -> {
                    try {
                        return objectMapper.readTree(value);
                    } catch (JsonProcessingException exception) {
                        throw new IllegalStateException(
                                "Stored grid config '" + key + "' is invalid JSON", exception);
                    }
                })
                .orElse(null);
    }

    /**
     * Save the config for a grid (insert or update in place).
     *
     * @return the config that was persisted
     */
    @Transactional
    public JsonNode write(String key, JsonNode config) {
        if (config == null || (!config.isArray() && !config.isObject())) {
            throw new IllegalArgumentException("Grid config must be a JSON array or object");
        }
        String serialized;
        try {
            serialized = objectMapper.writeValueAsString(config);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Grid config could not be serialized", exception);
        }
        gridConfigRepository.findByGridKey(key)
                .ifPresentOrElse(
                        existing -> existing.setConfigJson(serialized),
                        () -> gridConfigRepository.save(new GridConfig(key, serialized)));
        return config;
    }

    /** Reset the grid to its built-in defaults by removing the stored row. */
    @Transactional
    public void reset(String key) {
        gridConfigRepository.findByGridKey(key).ifPresent(gridConfigRepository::delete);
    }
}
