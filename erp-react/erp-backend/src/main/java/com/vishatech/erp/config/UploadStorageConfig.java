package com.vishatech.erp.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Prepares the disk location the servlet container spools multipart uploads to.
 *
 * <p>{@code spring.servlet.multipart.location} points every uploaded part at an
 * explicit directory instead of the container's implicit work directory. Tomcat
 * writes parts there but will not create the directory itself, so a missing path
 * would surface as an IOException on the first large upload — this fails fast at
 * startup instead, with the path in the message.
 *
 * <p>Being explicit matters in production: two copies of a large upload exist on
 * disk at once (the spool copy here, then the stored copy under
 * {@code app.upload.dir}), so this directory must sit on a volume sized for
 * {@code max-request-size} × the number of concurrent uploads. Leaving it unset
 * falls back to the container default and skips this bootstrap.
 */
@Configuration
public class UploadStorageConfig {

    private static final Logger log = LoggerFactory.getLogger(UploadStorageConfig.class);

    public UploadStorageConfig(@Value("${spring.servlet.multipart.location:}") String spoolLocation) {
        if (spoolLocation == null || spoolLocation.isBlank()) {
            log.info("Multipart spool location not configured — using the servlet container default.");
            return;
        }
        Path spoolDir = Paths.get(spoolLocation).toAbsolutePath().normalize();
        try {
            Files.createDirectories(spoolDir);
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Could not create the multipart spool directory " + spoolDir
                            + " — fix spring.servlet.multipart.location (ERP_UPLOAD_TEMP_DIR) "
                            + "or make the path writable.", e);
        }
        log.info("Multipart uploads spool to {}", spoolDir);
    }
}
