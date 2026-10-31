package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.ProcessingJobResponse;
import com.vishatech.erp.dto.SalesContractExtractionResult;
import com.vishatech.erp.entity.ProcessingJob;
import com.vishatech.erp.entity.ProcessingJobStatus;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.ProcessingJobRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import com.vishatech.erp.crm.entity.Customer;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.multipart.MultipartFile;

/**
 * Durable background processing jobs.
 *
 * <p>Heavy parsing used to run on the HTTP request thread: the Sales Contract
 * bulk upload parsed every uploaded document with PDFBox / Apache POI before it
 * could answer. It now returns 202 with a job id and runs on a bounded worker
 * pool fed by the {@code processing_jobs} table.
 *
 * <p>These tests pin the behaviour that makes that hand-off safe:
 *
 * <ul>
 *   <li>the request thread never runs the work, and one job type's worker count is
 *       capped (extra submissions stay QUEUED instead of piling onto the pool);</li>
 *   <li>the extracted results are byte-for-byte the ones the synchronous path
 *       produced (same four fields, same preview, same file name);</li>
 *   <li>the same batch submitted twice is one job, parsed once;</li>
 *   <li>failures become FAILED with a safe single-line reason, never a stack trace;</li>
 *   <li>invalid or oversized batches are rejected before anything is staged;</li>
 *   <li>a job interrupted by a restart is re-queued, then resumed without a
 *       resubmission, and failed once its retries are spent;</li>
 *   <li>two workers can never claim the same job;</li>
 *   <li>staged documents are deleted when the job ends, and one user cannot read
 *       another user's job (404);</li>
 *   <li>the HTTP contract is 202 + jobId, then status polling with the results.</li>
 * </ul>
 *
 * <p>The periodic sweep is pushed far out in this context so each test drives the
 * pipeline deterministically through the service API; the real scheduling is the
 * same code path ({@link ProcessingJobService#dispatchPending()}).
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.processing-jobs.concurrency=1",
        "app.processing-jobs.dispatch-interval-ms=3600000",
        "app.processing-jobs.housekeep-interval-ms=3600000",
        "app.processing-jobs.stale-timeout-ms=2000",
        "app.processing-jobs.max-attempts=2",
        "app.processing-jobs.max-files=3",
        "app.processing-jobs.max-file-bytes=4096",
        "app.processing-jobs.max-total-bytes=8192"
})
class ProcessingJobPipelineTests extends AbstractSecurityTest {

    private static final String INSTANT_TYPE = "TEST_INSTANT";
    private static final String BLOCKING_TYPE = "TEST_BLOCKING";

    /**
     * A run-unique staging root. The staging area is asserted to be empty after a
     * rejected batch, so it must not inherit leftovers from an earlier run.
     */
    private static final String TEST_UPLOAD_DIR =
            System.getProperty("java.io.tmpdir") + "/erp-processing-job-test-" + UUID.randomUUID();

    @DynamicPropertySource
    static void stagingRoot(DynamicPropertyRegistry registry) {
        registry.add("app.upload.dir", () -> TEST_UPLOAD_DIR);
    }

    @Autowired
    private ProcessingJobService processingJobs;

    @Autowired
    private ProcessingJobRepository jobRepository;

    @Autowired
    private ProcessingJobClaimer claimer;

    @Autowired
    private ProcessingJobInputStore inputStore;

    @Autowired
    private SalesContractBulkExtractionService bulkExtraction;

    @Autowired
    private SalesContractExtractionService extractionService;

    @Autowired
    private ObjectMapper mapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestJobRecorder recorder;

    // ------------------------------------------------------------------
    // Test-only handlers
    // ------------------------------------------------------------------

    /**
     * Controls the two synthetic job types the pipeline tests drive. The latches
     * are replaced for every test: this bean is a singleton for the whole context,
     * so a latch already counted down by an earlier test would silently turn the
     * "blocking" handler into an instant one.
     */
    static class TestJobRecorder {
        private volatile CountDownLatch blockingStarted = new CountDownLatch(1);
        private volatile CountDownLatch release = new CountDownLatch(1);
        final AtomicInteger instantRuns = new AtomicInteger();
        final AtomicReference<String> blockingThread = new AtomicReference<>();
        final AtomicReference<String> instantThread = new AtomicReference<>();

        void reset() {
            blockingStarted = new CountDownLatch(1);
            release = new CountDownLatch(1);
            instantRuns.set(0);
            blockingThread.set(null);
            instantThread.set(null);
        }

        CountDownLatch blockingStarted() {
            return blockingStarted;
        }

        CountDownLatch release() {
            return release;
        }
    }

    @TestConfiguration
    static class TestHandlers {

        @Bean
        TestJobRecorder testJobRecorder() {
            return new TestJobRecorder();
        }

        /** Completes instantly: represents a job that resumes after a restart. */
        @Bean
        ProcessingJobHandler instantTestHandler(TestJobRecorder recorder) {
            return new ProcessingJobHandler() {
                @Override
                public String jobType() {
                    return INSTANT_TYPE;
                }

                @Override
                public String process(ProcessingJob job) {
                    recorder.instantThread.set(Thread.currentThread().getName());
                    recorder.instantRuns.incrementAndGet();
                    return "{\"instant\":true}";
                }
            };
        }

        /** Holds the only worker permit until the test releases it. */
        @Bean
        ProcessingJobHandler blockingTestHandler(TestJobRecorder recorder) {
            return new ProcessingJobHandler() {
                @Override
                public String jobType() {
                    return BLOCKING_TYPE;
                }

                @Override
                public String process(ProcessingJob job) throws Exception {
                    recorder.blockingThread.set(Thread.currentThread().getName());
                    recorder.blockingStarted().countDown();
                    // Bounded so a test failure can never park a worker forever.
                    recorder.release().await(20, TimeUnit.SECONDS);
                    return "{\"blocking\":true}";
                }
            };
        }
    }

    @BeforeEach
    void freshRecorder() {
        recorder.reset();
    }

    @AfterEach
    void cleanup() throws Exception {
        // Never leave a worker parked on the latch, never leave a queued job for
        // the next test to trip over, and never leak an identity.
        recorder.release().countDown();
        for (int i = 0; i < 20 && processingJobs.dispatchPending() > 0; i++) {
            awaitFreeWorker();
        }
        awaitFreeWorker();
        SecurityContextHolder.clearContext();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static MockMultipartFile contractCsv(String fileName) {
        String csv = "Customer Name,Sales Contract No,Contract Date,Validity Period\n"
                + "ABC Industries Ltd,SC-2026-000145,12/08/2026,11/08/2027\n";
        return new MockMultipartFile("files", fileName, "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));
    }

    private static MockMultipartFile bytes(String fileName, int size, String contentType) {
        return new MockMultipartFile("files", fileName, contentType, new byte[size]);
    }

    private ProcessingJobResponse awaitTerminal(Long jobId) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 30_000;
        ProcessingJobResponse last = null;
        while (System.currentTimeMillis() < deadline) {
            last = processingJobs.status(jobId);
            if (ProcessingJobStatus.isTerminal(last.status())) {
                return last;
            }
            Thread.sleep(25);
        }
        throw new AssertionError("job " + jobId + " did not finish (last status: "
                + (last == null ? "unknown" : last.status()) + ")");
    }

    private ProcessingJob blockingJob() {
        return processingJobs.create(BLOCKING_TYPE, inputStore.newInputRef(), "blocking-fingerprint", "[]", 1);
    }

    /** A row shaped like one a previous process left behind. */
    private ProcessingJob historicalJob(String status, LocalDateTime startedAt, int attempts, int maxAttempts) {
        ProcessingJob job = new ProcessingJob();
        job.setJobType(INSTANT_TYPE);
        job.setStatus(status);
        job.setInputRef(inputStore.newInputRef());
        job.setFingerprint("historical-" + System.nanoTime());
        job.setItemCount(1);
        job.setAttempts(attempts);
        job.setMaxAttempts(maxAttempts);
        job.setStartedAt(startedAt);
        return jobRepository.save(job);
    }

    private Set<String> liveInputRefs() {
        return new HashSet<>(jobRepository
                .findByStatusIn(List.of(ProcessingJobStatus.QUEUED, ProcessingJobStatus.PROCESSING))
                .stream().map(ProcessingJob::getInputRef).collect(Collectors.toSet()));
    }

    /** Waits for a worker permit to come back (the release happens just after completion). */
    private void awaitFreeWorker() throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (processingJobs.availableWorkers() == 0 && System.currentTimeMillis() < deadline) {
            Thread.sleep(25);
        }
    }

    /**
     * Authenticates the calling thread. The three-argument constructor is the
     * authenticated one — the two-argument token is deliberately unauthenticated
     * in Spring Security, and an unauthenticated principal resolves to no user.
     */
    /** Terminal status of a job owned by another user, read over HTTP with that user's token. */
    private String awaitTerminalOverHttp(Long jobId, String bearerToken) throws Exception {
        long deadline = System.currentTimeMillis() + 30_000;
        String status = null;
        while (System.currentTimeMillis() < deadline) {
            String body = mockMvc.perform(get("/sales-contracts/bulk/extract/" + jobId)
                            .header("Authorization", bearerToken))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            status = mapper.readTree(body).path("data").path("status").asText();
            if (ProcessingJobStatus.isTerminal(status)) {
                return status;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("job " + jobId + " did not finish over HTTP (last status: " + status + ")");
    }

    private void authenticate(String email) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(email, null, List.of()));
    }

    // ------------------------------------------------------------------
    // Request thread + concurrency cap
    // ------------------------------------------------------------------

    @Test
    void workRunsOffTheRequestThreadAndConcurrencyIsCapped() throws Exception {
        ProcessingJob first = blockingJob();
        assertThat(processingJobs.tryDispatch(first.getId())).isTrue();
        assertThat(recorder.blockingStarted().await(10, TimeUnit.SECONDS))
                .as("the blocking worker must start")
                .isTrue();

        // The work ran on a processing-job worker, not on this thread.
        assertThat(recorder.blockingThread.get())
                .as("heavy work must not run on the calling thread")
                .startsWith("processing-job-")
                .isNotEqualTo(Thread.currentThread().getName());

        // Sole permit is taken: nothing else may start.
        assertThat(processingJobs.availableWorkers()).isZero();
        assertThat(processingJobs.status(first.getId()).status()).isEqualTo(ProcessingJobStatus.PROCESSING);

        ProcessingJob second = blockingJob();
        assertThat(processingJobs.status(second.getId()).status()).isEqualTo(ProcessingJobStatus.QUEUED);
        assertThat(processingJobs.dispatchPending())
                .as("no worker slot: the queue must not be drained")
                .isZero();
        assertThat(processingJobs.status(second.getId()).status()).isEqualTo(ProcessingJobStatus.QUEUED);

        // Free the worker: the queued job drains oldest-first, then the second.
        recorder.release().countDown();
        assertThat(awaitTerminal(first.getId()).status()).isEqualTo(ProcessingJobStatus.COMPLETED);
        processingJobs.dispatchPending();
        assertThat(awaitTerminal(second.getId()).status()).isEqualTo(ProcessingJobStatus.COMPLETED);

        awaitFreeWorker();
        assertThat(processingJobs.availableWorkers())
                .as("the permit must come back when the worker finishes")
                .isEqualTo(1);
    }

    // ------------------------------------------------------------------
    // Results identical to the synchronous path
    // ------------------------------------------------------------------

    @Test
    void backgroundExtractionReturnsExactlyTheSynchronousResults() throws Exception {
        MockMultipartFile document = contractCsv("contract-a.csv");

        // The old, in-request behaviour, for comparison.
        List<SalesContractExtractionResult> synchronous =
                extractionService.extract(new MultipartFile[]{document});

        ProcessingJob job = bulkExtraction.submit(new MultipartFile[]{contractCsv("contract-a.csv")});
        ProcessingJobResponse done = awaitTerminal(job.getId());

        assertThat(done.status()).isEqualTo(ProcessingJobStatus.COMPLETED);
        assertThat(done.error()).isNull();
        assertThat(done.results()).isNotNull();

        List<SalesContractExtractionResult> background = mapper.readValue(
                done.results().toString(), new TypeReference<List<SalesContractExtractionResult>>() { });

        assertThat(background).isEqualTo(synchronous);
        assertThat(background).hasSize(1);
        assertThat(background.get(0).fileName()).isEqualTo("contract-a.csv");
        // The fixture must actually exercise the extractor.
        assertThat(background.get(0).customerName().value()).isEqualTo("ABC Industries Ltd");
        assertThat(background.get(0).customerName().status()).isEqualTo("extracted");
        assertThat(background.get(0).contractDate().value()).isEqualTo("2026-08-12");
        assertThat(background.get(0).validity().value()).isEqualTo("2027-08-11");
    }

    @Test
    void stagedDocumentsAreDeletedWhenTheJobEnds() throws Exception {
        ProcessingJob job = bulkExtraction.submit(new MultipartFile[]{contractCsv("cleanup.csv")});
        assertThat(inputStore.hasInputs(job.getInputRef()))
                .as("the batch is staged while the job is pending")
                .isTrue();

        assertThat(awaitTerminal(job.getId()).status()).isEqualTo(ProcessingJobStatus.COMPLETED);
        assertThat(inputStore.hasInputs(job.getInputRef()))
                .as("staged documents must not outlive the job")
                .isFalse();
    }

    // ------------------------------------------------------------------
    // Duplicate submissions and duplicate processing
    // ------------------------------------------------------------------

    @Test
    void submittingTheSameBatchTwiceIsOneJobParsedOnce() throws Exception {
        long before = jobRepository.count();

        ProcessingJob first = bulkExtraction.submit(new MultipartFile[]{contractCsv("same.csv")});
        ProcessingJob second = bulkExtraction.submit(new MultipartFile[]{contractCsv("same.csv")});
        ProcessingJob third = bulkExtraction.submit(new MultipartFile[]{contractCsv("same.csv")});
        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(third.getId()).isEqualTo(first.getId());
        assertThat(jobRepository.count())
                .as("a repeated submission must not create more jobs")
                .isEqualTo(before + 1);

        ProcessingJobResponse done = awaitTerminal(first.getId());
        assertThat(done.status()).isEqualTo(ProcessingJobStatus.COMPLETED);
        assertThat(done.attempts())
                .as("the batch must be parsed exactly once")
                .isEqualTo(1);
    }

    @Test
    void aFailedAttemptIsNotReusedSoUploadingAgainReallyRetries() throws Exception {
        ProcessingJob first = bulkExtraction.submit(new MultipartFile[]{contractCsv("retry.csv")});
        assertThat(awaitTerminal(first.getId()).status()).isEqualTo(ProcessingJobStatus.COMPLETED);

        // The same batch, except the previous attempt did not succeed.
        ProcessingJob previous = jobRepository.findById(first.getId()).orElseThrow();
        previous.setStatus(ProcessingJobStatus.FAILED);
        previous.setErrorMessage("simulated failure");
        previous.setResultPayload(null);
        jobRepository.save(previous);

        ProcessingJob resubmitted = bulkExtraction.submit(new MultipartFile[]{contractCsv("retry.csv")});
        assertThat(resubmitted.getId())
                .as("a failed attempt must not be handed back as the answer")
                .isNotEqualTo(first.getId());
        assertThat(awaitTerminal(resubmitted.getId()).status()).isEqualTo(ProcessingJobStatus.COMPLETED);
    }

    @Test
    void onlyOneWorkerCanClaimTheSameJob() throws Exception {
        ProcessingJob job = historicalJob(ProcessingJobStatus.QUEUED, null, 0, 2);

        int workers = 8;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(workers);
        List<Future<Boolean>> claims = new ArrayList<>();
        try {
            for (int i = 0; i < workers; i++) {
                claims.add(pool.submit(() -> {
                    start.await();
                    return claimer.claim(job.getId());
                }));
            }
            start.countDown();

            int winners = 0;
            for (Future<Boolean> claim : claims) {
                if (claim.get(20, TimeUnit.SECONDS)) {
                    winners++;
                }
            }
            assertThat(winners)
                    .as("exactly one worker may own a job")
                    .isEqualTo(1);
            assertThat(jobRepository.findById(job.getId()).orElseThrow().getAttempts()).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    // ------------------------------------------------------------------
    // Failure + validation
    // ------------------------------------------------------------------

    @Test
    void aJobWhoseDocumentsDisappearedFailsWithASafeReason() throws Exception {
        // Hold the only worker so the extraction job is still QUEUED when the
        // staged documents are removed (deterministic, no race with the worker).
        ProcessingJob blocker = blockingJob();
        assertThat(processingJobs.tryDispatch(blocker.getId())).isTrue();
        assertThat(recorder.blockingStarted().await(10, TimeUnit.SECONDS)).isTrue();

        ProcessingJob job = bulkExtraction.submit(new MultipartFile[]{contractCsv("gone.csv")});
        assertThat(processingJobs.status(job.getId()).status()).isEqualTo(ProcessingJobStatus.QUEUED);
        inputStore.deleteInputs(job.getInputRef());

        recorder.release().countDown();
        assertThat(awaitTerminal(blocker.getId()).status()).isEqualTo(ProcessingJobStatus.COMPLETED);
        processingJobs.dispatchPending();

        ProcessingJobResponse failed = awaitTerminal(job.getId());
        assertThat(failed.status()).isEqualTo(ProcessingJobStatus.FAILED);
        assertThat(failed.results()).isNull();
        assertThat(failed.error())
                .as("the client gets an actionable reason …")
                .contains("no longer available")
                // … and never internal detail.
                .doesNotContain("\n")
                .doesNotContain("Exception")
                .doesNotContain("\\")
                .doesNotContain("/");
        assertThat(failed.error().length()).isLessThanOrEqualTo(500);
    }

    @Test
    void invalidBatchesAreRejectedBeforeAnythingIsStaged() {
        assertThatThrownBy(() -> bulkExtraction.submit(new MultipartFile[]{
                bytes("payload.exe", 128, "application/octet-stream")}))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Unsupported file type");

        assertThatThrownBy(() -> bulkExtraction.submit(new MultipartFile[]{
                bytes("empty.csv", 0, "text/csv")}))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("is empty");

        assertThatThrownBy(() -> bulkExtraction.submit(new MultipartFile[]{
                bytes("huge.csv", 5000, "text/csv")}))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("too large");

        assertThatThrownBy(() -> bulkExtraction.submit(new MultipartFile[]{
                bytes("a.csv", 10, "text/csv"), bytes("b.csv", 10, "text/csv"),
                bytes("c.csv", 10, "text/csv"), bytes("d.csv", 10, "text/csv")}))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Too many documents");

        assertThatThrownBy(() -> bulkExtraction.submit(new MultipartFile[]{
                bytes("one.csv", 3000, "text/csv"), bytes("two.csv", 3000, "text/csv"),
                bytes("three.csv", 3000, "text/csv")}))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("batch is too large");

        assertThatThrownBy(() -> bulkExtraction.submit(new MultipartFile[0]))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("No files were uploaded");

        assertThat(inputStore.sweepOrphans(liveInputRefs(), LocalDateTime.now()))
                .as("a rejected batch must leave nothing on disk")
                .isZero();
    }

    // ------------------------------------------------------------------
    // Restart safety
    // ------------------------------------------------------------------

    @Test
    void aJobInterruptedByARestartIsResumedAndThenFailsOnceRetriesAreSpent() throws Exception {
        // 1) A row left PROCESSING by a process that died.
        ProcessingJob interrupted = historicalJob(
                ProcessingJobStatus.PROCESSING, LocalDateTime.now().minusMinutes(10), 1, 2);

        assertThat(processingJobs.recoverInterrupted()).isGreaterThanOrEqualTo(1);
        ProcessingJob requeued = jobRepository.findById(interrupted.getId()).orElseThrow();
        assertThat(requeued.getStatus()).isEqualTo(ProcessingJobStatus.QUEUED);
        assertThat(requeued.getStartedAt()).isNull();

        // 2) The next start picks it up with no resubmission from the user.
        processingJobs.dispatchPending();
        ProcessingJobResponse resumed = awaitTerminal(interrupted.getId());
        assertThat(resumed.status()).isEqualTo(ProcessingJobStatus.COMPLETED);
        assertThat(resumed.attempts()).isEqualTo(2);

        // 3) Interrupted again, with the retry budget spent -> FAILED, safely.
        ProcessingJob spent = historicalJob(
                ProcessingJobStatus.PROCESSING, LocalDateTime.now().minusMinutes(10), 2, 2);
        processingJobs.recoverInterrupted();

        ProcessingJobResponse failed = processingJobs.status(spent.getId());
        assertThat(failed.status()).isEqualTo(ProcessingJobStatus.FAILED);
        assertThat(failed.error()).contains("Interrupted by a server restart");
    }

    @Test
    void aFreshlyRunningJobIsNotStolenByRecovery() throws Exception {
        ProcessingJob fresh = historicalJob(ProcessingJobStatus.PROCESSING, LocalDateTime.now(), 1, 2);

        processingJobs.recoverInterrupted();

        assertThat(jobRepository.findById(fresh.getId()).orElseThrow().getStatus())
                .as("a job started moments ago may still be running elsewhere")
                .isEqualTo(ProcessingJobStatus.PROCESSING);
    }

    // ------------------------------------------------------------------
    // Status scoping
    // ------------------------------------------------------------------

    @Test
    void aJobIsOnlyReadableByItsOwnerOrAnAdmin() {
        User owner = userRepository.findByEmail("kavya@vishaktech.com").orElseThrow();
        User admin = userRepository.findByEmail("admin@vishaktech.com").orElseThrow();

        ProcessingJob job = historicalJob(ProcessingJobStatus.COMPLETED, LocalDateTime.now(), 1, 2);
        job.setRequestedByUserId(owner.getId());
        job.setResultPayload("[]");
        jobRepository.save(job);

        authenticate(owner.getEmail());
        assertThat(processingJobs.status(job.getId()).jobId()).isEqualTo(job.getId());

        authenticate(admin.getEmail());
        assertThat(processingJobs.status(job.getId()).jobId()).isEqualTo(job.getId());

        authenticate("someone.else@vishaktech.com");
        assertThatThrownBy(() -> processingJobs.status(job.getId()))
                .as("another user must not be able to read extracted document contents")
                .isInstanceOf(NoSuchElementException.class);

        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> processingJobs.status(job.getId()))
                .isInstanceOf(NoSuchElementException.class);

        assertThatThrownBy(() -> processingJobs.status(job.getId() + 999_999L))
                .isInstanceOf(NoSuchElementException.class);
    }

    // ------------------------------------------------------------------
    // Responsiveness of normal HTTP traffic
    // ------------------------------------------------------------------

    @Test
    void httpKeepsAnsweringWhileHeavyWorkRuns() throws Exception {
        String token = "Bearer " + jwtService.generateToken(
                userDetailsService.loadUserByUsername("admin@vishaktech.com"));

        // A heavy job holds the only worker (it parks until released below).
        ProcessingJob blocker = blockingJob();
        assertThat(processingJobs.tryDispatch(blocker.getId())).isTrue();
        assertThat(recorder.blockingStarted().await(10, TimeUnit.SECONDS)).isTrue();

        // An ordinary request is answered immediately, not queued behind it.
        long startedAt = System.currentTimeMillis();
        mockMvc.perform(get("/sales-contracts/bulk/extract/999999999").header("Authorization", token))
                .andExpect(status().isNotFound());
        assertThat(System.currentTimeMillis() - startedAt)
                .as("a normal request must not wait for the heavy job")
                .isLessThan(5_000);

        // Uploading during that time is accepted (202) instead of blocking: the
        // batch is queued and starts when the worker frees up.
        startedAt = System.currentTimeMillis();
        String body = mockMvc.perform(multipart("/sales-contracts/bulk/extract")
                        .file(contractCsv("queued-while-busy.csv"))
                        .header("Authorization", token))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        assertThat(System.currentTimeMillis() - startedAt)
                .as("an upload must be accepted without parsing on the request thread")
                .isLessThan(5_000);

        Long queuedJobId = mapper.readTree(body).path("data").path("jobId").asLong();
        mockMvc.perform(get("/sales-contracts/bulk/extract/" + queuedJobId).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("QUEUED"));

        recorder.release().countDown();
        assertThat(awaitTerminal(blocker.getId()).status()).isEqualTo(ProcessingJobStatus.COMPLETED);
        processingJobs.dispatchPending();
        assertThat(awaitTerminalOverHttp(queuedJobId, token)).isEqualTo(ProcessingJobStatus.COMPLETED);
    }

    // ------------------------------------------------------------------
    // Production schema must match the applied migration script
    // ------------------------------------------------------------------

    /**
     * Production runs with {@code ddl-auto=validate} and this project has no
     * migration framework, so a column that exists on the entity but not in
     * {@code docs/processing_jobs.sql} fails the next startup with a schema
     * error. This ties the two together.
     */
    @Test
    void theMigrationScriptDeclaresEveryColumnOfTheEntity() throws Exception {
        String script = java.nio.file.Files.readString(java.nio.file.Path.of("docs/processing_jobs.sql"));
        int start = script.indexOf("CREATE TABLE IF NOT EXISTS processing_jobs");
        int end = script.indexOf(") ENGINE", start);
        assertThat(start).as("the migration must create processing_jobs").isNotNegative();
        assertThat(end).as("the migration must be a script, not a fragment").isGreaterThan(start);
        String ddl = script.substring(start, end);

        for (java.lang.reflect.Field field : ProcessingJob.class.getDeclaredFields()) {
            if (field.isSynthetic() || java.lang.reflect.Modifier.isStatic(field.getModifiers())) {
                continue;
            }
            jakarta.persistence.Column column = field.getAnnotation(jakarta.persistence.Column.class);
            String name = column != null && !column.name().isBlank()
                    ? column.name()
                    : field.getName().replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase(Locale.ROOT);
            assertThat(ddl)
                    .as("column %s (%s) must exist in the migration's CREATE TABLE", name, field.getName())
                    .contains(name);
        }

        assertThat(ddl).contains("PRIMARY KEY (id)");
        assertThat(script).contains("idx_pjob_status_created");
        assertThat(script).contains("idx_pjob_type_fingerprint");
        assertThat(script).contains("idx_pjob_started");
    }

    // ------------------------------------------------------------------
    // HTTP contract: 202 + jobId, then polling
    // ------------------------------------------------------------------

    @Test
    void theEndpointAcceptsWith202AndTheJobIsPolledToCompletion() throws Exception {
        String token = "Bearer " + jwtService.generateToken(
                userDetailsService.loadUserByUsername("admin@vishaktech.com"));
        String otherToken = "Bearer " + jwtService.generateToken(
                userDetailsService.loadUserByUsername("kavya@vishaktech.com"));

        MockMultipartFile document = new MockMultipartFile(
                "files", "http-contract.csv", "text/csv",
                ("Customer Name,Sales Contract No,Contract Date,Validity Period\n"
                        + "ABC Industries Ltd,SC-2026-999001,01/02/2026,31/01/2027\n")
                        .getBytes(StandardCharsets.UTF_8));

        // 202 Accepted with a job id — not a 200 with parsed results.
        String body = mockMvc.perform(multipart("/sales-contracts/bulk/extract")
                        .file(document)
                        .header("Authorization", token))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.jobId").isNumber())
                .andReturn().getResponse().getContentAsString();

        Long jobId = mapper.readTree(body).path("data").path("jobId").asLong();
        assertThat(jobId).isPositive();

        // Poll until the worker writes the results.
        long deadline = System.currentTimeMillis() + 30_000;
        String statusValue = null;
        while (System.currentTimeMillis() < deadline) {
            String polled = mockMvc.perform(get("/sales-contracts/bulk/extract/" + jobId)
                            .header("Authorization", token))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            statusValue = mapper.readTree(polled).path("data").path("status").asText();
            if (ProcessingJobStatus.isTerminal(statusValue)) {
                break;
            }
            Thread.sleep(100);
        }
        assertThat(statusValue).isEqualTo(ProcessingJobStatus.COMPLETED);

        mockMvc.perform(get("/sales-contracts/bulk/extract/" + jobId).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.results[0].fileName").value("http-contract.csv"))
                .andExpect(jsonPath("$.data.results[0].customerName.value").value("ABC Industries Ltd"));

        // Another user cannot read this job.
        mockMvc.perform(get("/sales-contracts/bulk/extract/" + jobId).header("Authorization", otherToken))
                .andExpect(status().isNotFound());

        // Unknown job and unauthenticated calls.
        mockMvc.perform(get("/sales-contracts/bulk/extract/" + (jobId + 999_999L)).header("Authorization", token))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/sales-contracts/bulk/extract/" + jobId))
                .andExpect(status().isUnauthorized());

        // A rejected batch is still a 400 with the original message.
        mockMvc.perform(multipart("/sales-contracts/bulk/extract")
                        .file(new MockMultipartFile("files", "payload.exe", "application/octet-stream",
                                new byte[16]))
                        .header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Unsupported file type")));
    }
}
