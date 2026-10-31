package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.service.LeadService;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;

/**
 * The Lead CSV import reads text, so it is bounded by configuration.
 *
 * <p>The import used to read the whole upload into the heap before looking at a
 * single row. It now reads through a capped, streamed read: a legitimate file
 * imports exactly as before, and a file over the cap fails with a clear 400
 * instead of growing the heap to the size of the upload.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "app.upload.dir=${java.io.tmpdir}/erp-lead-import-test-uploads",
        "app.upload.lead-import-max-bytes=131072"
})
class LeadImportLimitTests extends AbstractSecurityTest {

    private static final String CSV = """
            Name,Company,Email,Phone,Value,Stage,Source,Owner
            Acme Metals,Ravi Traders,ravi@acme.example,+91 90000 00001,150000,NEW,Referral,ops
            Beta Castings,Sunil Foundry,sunil@beta.example,+91 90000 00002,90000,CONTACTED,Website,ops
            """;

    @Autowired
    private LeadService leadService;

    @Test
    void importsALegitimateCsvWithinTheCap() {
        MockMultipartFile file = new MockMultipartFile("file", "leads.csv", "text/csv",
                CSV.getBytes(StandardCharsets.UTF_8));

        assertThat(leadService.importLeads(file)).isEqualTo(2);
    }

    @Test
    void refusesAnImportAboveTheCapWithAClearMessage() {
        MockMultipartFile file = new MockMultipartFile("file", "leads.csv", "text/csv",
                oversizedCsv());

        assertThatThrownBy(() -> leadService.importLeads(file))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("too large");
    }

    /** A well-formed CSV whose total size is above the 128 KB cap under test. */
    private static byte[] oversizedCsv() {
        StringBuilder csv = new StringBuilder("Name,Company,Email\n");
        for (int i = 0; i < 6000; i++) {
            csv.append("Lead ").append(i).append(",Company ").append(i)
               .append(",lead").append(i).append("@example.com\n");
        }
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }
}
