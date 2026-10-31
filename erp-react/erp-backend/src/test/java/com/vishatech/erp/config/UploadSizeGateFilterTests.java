package com.vishatech.erp.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * The early upload gate: an oversized multipart request is answered with a 413
 * straight from its {@code Content-Length}, so the container never spools the
 * body. Everything else — including requests whose size cannot be known up front
 * — passes through to the container limit and the existing 413 handler.
 */
class UploadSizeGateFilterTests {

    private static final String TEN_KB = "10KB";
    private static final int AT_LIMIT_BYTES = 10 * 1024;
    private static final int OVER_LIMIT_BYTES = 20 * 1024;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final UploadSizeGateFilter filter = new UploadSizeGateFilter(TEN_KB, objectMapper);

    @Test
    void rejectsAnOversizedMultipartUploadBeforeTheChainRuns() throws Exception {
        MockHttpServletRequest request = multipartRequest();
        request.setContent(new byte[OVER_LIMIT_BYTES]);

        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainRan = new AtomicBoolean(false);
        FilterChain chain = (req, res) -> chainRan.set(true);

        filter.doFilter(request, response, chain);

        assertThat(chainRan).isFalse();
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(response.getHeader(HttpHeaders.CONNECTION)).isEqualTo("close");
        JsonNode body = objectMapper.readTree(response.getContentAsString());
        assertThat(body.get("success").asBoolean()).isFalse();
        assertThat(body.get("message").asText()).contains(TEN_KB);
        assertThat(body.get("data").isNull()).isTrue();
    }

    @Test
    void passesThroughAnUploadExactlyAtTheLimit() throws Exception {
        MockHttpServletRequest request = multipartRequest();
        request.setContent(new byte[AT_LIMIT_BYTES]);

        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainRan = new AtomicBoolean(false);

        filter.doFilter(request, response, (req, res) -> chainRan.set(true));

        assertThat(chainRan).isTrue();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void passesThroughAChunkedUploadWithNoDeclaredLength() throws Exception {
        // Chunked requests report -1: the size is unknowable from headers, so the
        // container limit stays the authority for them.
        MockHttpServletRequest request = new ChunkedMultipartRequest();
        assertThat(request.getContentLengthLong()).isEqualTo(-1);

        AtomicBoolean chainRan = new AtomicBoolean(false);
        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> chainRan.set(true));

        assertThat(chainRan).isTrue();
    }

    @Test
    void ignoresNonMultipartRequestsOfAnySize() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/v1/leads");
        request.setContentType("application/json");
        request.setContent(new byte[OVER_LIMIT_BYTES]);

        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainRan = new AtomicBoolean(false);

        filter.doFilter(request, response, (req, res) -> chainRan.set(true));

        assertThat(chainRan).isTrue();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    /** A multipart request with no declared length, the way chunked uploads arrive. */
    private static final class ChunkedMultipartRequest extends MockHttpServletRequest {

        ChunkedMultipartRequest() {
            super("POST", "/v1/sales-contracts/bulk/extract");
            setContentType("multipart/form-data; boundary=----erpTestBoundary");
        }

        @Override
        public long getContentLengthLong() {
            return -1;
        }
    }

    private MockHttpServletRequest multipartRequest() {
        MockHttpServletRequest request =
                new MockHttpServletRequest("POST", "/v1/sales-contracts/bulk/extract");
        request.setContentType("multipart/form-data; boundary=----erpTestBoundary");
        return request;
    }
}
