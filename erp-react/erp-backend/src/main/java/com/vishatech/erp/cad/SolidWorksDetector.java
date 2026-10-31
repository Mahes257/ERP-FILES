package com.vishatech.erp.cad;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;

/**
 * Dynamically detects whether a real local SolidWorks installation is available
 * on this server. Detection is discovery-based (registry + well-known install
 * directories); it never relies on a hardcoded fake path and never claims
 * availability unless a real installation is found.
 *
 * Because SolidWorks is proprietary and is <em>not</em> installed on the
 * current machine, this detector reports the provider as unavailable, which in
 * turn makes SLDPRT/SLDASM resolve to an honest {@code UNSUPPORTED} state. When
 * a licensed SolidWorks installation is later provisioned on the server, this
 * class (or its registry lookup) is the single place that flips availability on
 * without any viewer or pipeline change.
 */
@Component
public class SolidWorksDetector {

    private static final Logger log = LoggerFactory.getLogger(SolidWorksDetector.class);

    /** Candidate install locations, checked only if a directory actually exists. */
    private static final List<String> INSTALL_DIRS = Arrays.asList(
        "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS",
        "C:\\Program Files (x86)\\SOLIDWORKS Corp\\SOLIDWORKS",
        "C:\\Program Files\\Dassault Systemes\\SOLIDWORKS",
        "C:\\Program Files\\SOLIDWORKS Corp"
    );

    /** Registry roots checked for a SolidWorks product/version key. */
    private static final List<String> REGISTRY_ROOTS = java.util.Arrays.asList(
        "HKLM:\\SOFTWARE\\SolidWorks",
        "HKLM:\\SOFTWARE\\WOW6432Node\\SolidWorks",
        "HKCU:\\SOFTWARE\\SolidWorks",
        "HKLM:\\SOFTWARE\\Dassault Systemes"
    );

    /** COM ProgID whose registration proves the automation API is usable. */
    private static final String SW_PROGID = "SldWorks.Application";

    private volatile Boolean cachedAvailable;
    private volatile String cachedExecutable;

    /**
     * True when a genuine SolidWorks installation (SLDWORKS.exe / API) is
     * detected on the server. Cached for the lifetime of the process.
     */
    public boolean isAvailable() {
        if (cachedAvailable != null) {
            return cachedAvailable;
        }
        boolean available = detect();
        cachedAvailable = available;
        log.info("SolidWorks local conversion provider available: {}", available);
        return available;
    }

    /**
     * Absolute path of the detected SLDWORKS.exe, or empty when unavailable.
     * Cached together with {@link #isAvailable()}.
     */
    public java.util.Optional<Path> findExecutable() {
        isAvailable(); // ensure detection has run
        if (cachedExecutable == null) {
            return java.util.Optional.empty();
        }
        return java.util.Optional.of(Paths.get(cachedExecutable));
    }

    private boolean detect() {
        // 1) Well-known install directories holding SLDWORKS.exe. The COM ProgID
        //    must ALSO be registered — leftover product keys from a partial
        //    uninstall can point at a directory that no longer contains a
        //    working installation.
        for (String dir : INSTALL_DIRS) {
            File exe = new File(dir + "\\SLDWORKS.exe");
            if (exe.isFile() && comProgIdRegistered()) {
                cachedExecutable = exe.getAbsolutePath();
                return true;
            }
        }

        // 2) Registry product key. A key alone is NOT sufficient: machines with
        //    a partially-uninstalled SolidWorks keep keys while the COM API is
        //    gone. The automation ProgID is the real capability test.
        for (String root : REGISTRY_ROOTS) {
            try {
                Process p = new ProcessBuilder(
                    "reg", "query", root
                ).redirectErrorStream(true).start();
                byte[] buff = p.getInputStream().readAllBytes();
                boolean closed = p.waitFor(10, java.util.concurrent.TimeUnit.SECONDS);
                if (!closed) {
                    p.destroyForcibly();
                }
                if (buff.length > 0 && comProgIdRegistered()) {
                    // Registry + COM API prove installation; the exact
                    // executable path is optional (COM is ProgID-based).
                    cachedExecutable = null;
                    return true;
                }
            } catch (Exception e) {
                // registry key absent -> not installed
            }
        }

        return false;
    }

    /**
     * True when the SolidWorks automation COM class is actually registered.
     * This is what distinguishes a usable install from uninstall leftovers.
     */
    private boolean comProgIdRegistered() {
        try {
            Process p = new ProcessBuilder(
                "reg", "query", "HKLM\\SOFTWARE\\Classes\\" + SW_PROGID
            ).redirectErrorStream(true).start();
            boolean closed = p.waitFor(10, java.util.concurrent.TimeUnit.SECONDS);
            if (!closed) {
                p.destroyForcibly();
            }
            return p.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }
}
