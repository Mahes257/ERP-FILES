package com.vishatech.erp.marketing.access;

/**
 * The actions an administrator can grant per Marketing area.
 *
 * Only actions that actually exist in the Marketing module are modelled: a
 * page that has no delete never offers a delete switch.
 */
public enum MarketingAccessAction {

    /** Read the page and the data behind it. */
    VIEW("view"),
    CREATE("create"),
    EDIT("edit"),
    DELETE("delete"),
    /** Approve / reject / request revision on the module's approval workflows. */
    APPROVE("approve"),
    EXPORT("export"),
    PRINT("print"),
    /** Upload (and manage) attachments and bills. */
    UPLOAD("upload");

    private final String key;

    MarketingAccessAction(String key) {
        this.key = key;
    }

    public String key() {
        return key;
    }

    public static MarketingAccessAction fromKey(String key) {
        if (key == null) {
            return null;
        }
        for (MarketingAccessAction action : values()) {
            if (action.key.equalsIgnoreCase(key.trim())) {
                return action;
            }
        }
        return null;
    }
}
