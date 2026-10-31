package com.vishatech.erp.marketing.access;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * The Marketing module's real, existing functional areas — one per page /
 * submodule that exists in the current codebase (see the frontend routes in
 * {@code src/App.jsx} and the Marketing Hub tabs). Settings-only configuration
 * sections (campaigns, channels, templates, automation, masters, numbering,
 * notifications) are not pages of their own, so they are not separate areas:
 * they are configured through the single Marketing Settings area.
 *
 * Each area declares exactly the actions its pages actually support, so the
 * Access Management matrix never offers a switch for an action that does not
 * exist.
 */
public enum MarketingAccessArea {

    DASHBOARD("dashboard", "Marketing Dashboard", MarketingAccessAction.VIEW),

    VISITS("visits", "Visits & Visit Entry",
            MarketingAccessAction.VIEW, MarketingAccessAction.CREATE, MarketingAccessAction.EDIT,
            MarketingAccessAction.DELETE, MarketingAccessAction.EXPORT),

    FOLLOWUPS("followups", "Follow-ups & Extensions",
            MarketingAccessAction.VIEW, MarketingAccessAction.CREATE, MarketingAccessAction.EDIT,
            MarketingAccessAction.DELETE),

    QFORMS("qforms", "Q Forms",
            MarketingAccessAction.VIEW, MarketingAccessAction.CREATE, MarketingAccessAction.EDIT,
            MarketingAccessAction.DELETE, MarketingAccessAction.PRINT, MarketingAccessAction.UPLOAD),

    EXPENSES("expenses", "Marketing Expenses",
            MarketingAccessAction.VIEW, MarketingAccessAction.CREATE, MarketingAccessAction.EDIT,
            MarketingAccessAction.DELETE, MarketingAccessAction.APPROVE, MarketingAccessAction.PRINT,
            MarketingAccessAction.UPLOAD),

    TRAVEL_SCHEDULER("travelScheduler", "Travel Scheduler",
            MarketingAccessAction.VIEW, MarketingAccessAction.CREATE, MarketingAccessAction.EDIT,
            MarketingAccessAction.DELETE, MarketingAccessAction.APPROVE, MarketingAccessAction.UPLOAD),

    TRAVEL_REGISTRY("travelRegistry", "Travel Registry",
            MarketingAccessAction.VIEW, MarketingAccessAction.CREATE, MarketingAccessAction.EDIT,
            MarketingAccessAction.DELETE, MarketingAccessAction.APPROVE, MarketingAccessAction.UPLOAD),

    CALENDAR("calendar", "Calendar", MarketingAccessAction.VIEW),

    // UPLOAD is real here: the map's location detail panel uploads photos
    // (POST /marketing/map/locations/{id}/photos). Without it in this list the
    // request policy could require map.upload while can() refused every area/
    // action pair the area does not declare — which made that upload a
    // permanent 403 for everyone, including ADMIN.
    MAP("map", "Location & Map",
            MarketingAccessAction.VIEW, MarketingAccessAction.CREATE, MarketingAccessAction.EDIT,
            MarketingAccessAction.DELETE, MarketingAccessAction.UPLOAD),

    SETTINGS("settings", "Marketing Settings",
            MarketingAccessAction.VIEW, MarketingAccessAction.EDIT);

    private final String key;
    private final String label;
    private final Set<MarketingAccessAction> actions;

    MarketingAccessArea(String key, String label, MarketingAccessAction... actions) {
        this.key = key;
        this.label = label;
        this.actions = Collections.unmodifiableSet(EnumSet.of(actions[0], actions));
    }

    public String key() {
        return key;
    }

    public String label() {
        return label;
    }

    public Set<MarketingAccessAction> actions() {
        return actions;
    }

    public boolean supports(MarketingAccessAction action) {
        return actions.contains(action);
    }

    public static MarketingAccessArea fromKey(String key) {
        if (key == null) {
            return null;
        }
        for (MarketingAccessArea area : values()) {
            if (area.key.equalsIgnoreCase(key.trim())) {
                return area;
            }
        }
        return null;
    }
}
