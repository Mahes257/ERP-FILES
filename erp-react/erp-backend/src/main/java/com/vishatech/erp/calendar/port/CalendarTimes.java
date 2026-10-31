package com.vishatech.erp.calendar.port;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The one time-of-day rule every calendar adapter uses.
 *
 * <p>Business modules store times as free text, so an adapter must not blindly
 * forward a value the Calendar cannot place on its grid. This converts a real
 * stored time into the Calendar's {@code HH:mm} form and returns {@code null}
 * for anything it cannot prove is a valid time. Returning {@code null} makes the
 * entry all-day, which is the honest outcome: the record has a date but no
 * usable time, so no time is invented for it.
 *
 * <p>Accepted (because these are unambiguous 24-hour or explicitly AM/PM
 * values): {@code 9:05}, {@code 09:05}, {@code 9:05 AM}, {@code 09:05 PM}.
 * Rejected: blank text, {@code 24:00}, {@code 9}, {@code 25:10}, {@code 9:5}.
 */
public final class CalendarTimes {

    private static final Pattern H24 = Pattern.compile("^([01]?\\d|2[0-3]):([0-5]\\d)$");
    private static final Pattern H12 = Pattern.compile(
            "^([1-9]|1[0-2]):([0-5]\\d)\\s*([AaPp][Mm])$");

    private CalendarTimes() {
    }

    /** {@code "9:05 PM"} -> {@code "21:05"}; anything unreadable -> {@code null}. */
    public static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String value = raw.trim();
        if (value.isEmpty()) {
            return null;
        }

        Matcher h24 = H24.matcher(value);
        if (h24.matches()) {
            return pad(h24.group(1)) + ":" + h24.group(2);
        }

        Matcher h12 = H12.matcher(value);
        if (h12.matches()) {
            int hour = Integer.parseInt(h12.group(1)) % 12;
            if ("PM".equalsIgnoreCase(h12.group(3))) {
                hour += 12;
            }
            return (hour < 10 ? "0" : "") + hour + ":" + h12.group(2);
        }

        return null;
    }

    private static String pad(String hour) {
        return hour.length() == 1 ? "0" + hour : hour;
    }
}
