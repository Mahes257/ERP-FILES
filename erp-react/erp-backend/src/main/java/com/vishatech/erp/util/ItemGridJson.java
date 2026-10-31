package com.vishatech.erp.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Shared JSON helpers for the grid column feature.
 *
 * Per-row custom column values (the "Add Custom Column" values of every
 * editable item grid) are stored as a JSON object {columnId: value} on the
 * item row — exactly the shape the CPR item grid already uses
 * (CprItem.customFieldsJson). One TEXT column per item table, never a dynamic
 * ALTER TABLE per user column.
 */
public final class ItemGridJson {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ItemGridJson() {
    }

    /** Serialize a per-row custom-value map (null/empty → null, nothing stored). */
    public static String writeMap(Map<String, String> map) {
        if (map == null || map.isEmpty()) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(map);
        } catch (Exception exception) {
            return null;
        }
    }

    /** Parse a stored per-row custom-value map (always a mutable, non-null map). */
    public static Map<String, String> readMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, String> map = MAPPER.readValue(json, new TypeReference<Map<String, String>>() {
            });
            return map == null ? new LinkedHashMap<>() : map;
        } catch (Exception exception) {
            return new LinkedHashMap<>();
        }
    }

    /** Serialize a list of label/value maps (e.g. description detail rows). */
    public static String writeList(List<Map<String, String>> list) {
        if (list == null || list.isEmpty()) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(list);
        } catch (Exception exception) {
            return null;
        }
    }

    /** Parse a stored list of label/value maps (always a mutable, non-null list). */
    public static List<Map<String, String>> readList(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            List<Map<String, String>> list = MAPPER.readValue(json, new TypeReference<List<Map<String, String>>>() {
            });
            return list == null ? new ArrayList<>() : new ArrayList<>(list);
        } catch (Exception exception) {
            return new ArrayList<>();
        }
    }
}
