package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.repository.SalesAttachmentRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.production.ProductionAttachmentService;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * P5 — the attachment port must not introduce a transaction boundary.
 *
 * <p>{@code AttachmentStorePort}'s javadoc claims that a call made from inside a caller's
 * transaction joins that transaction (the implementation carries the same
 * {@code @Transactional}/{@code REQUIRED} annotations the Production service used to carry),
 * so the attachment row and the caller's own work still commit or roll back as one unit.
 * That claim is only worth making if it is tested: if the adapter had been annotated
 * {@code REQUIRES_NEW} — or if the RPC-shaped port had been implemented behind an HTTP hop —
 * the row below would survive the caller's rollback and this test would fail, by design.
 *
 * <p><b>Scope of the claim.</b> What is atomic is the attachment <em>row</em>, i.e. exactly
 * what the pre-port code made atomic. The uploaded bytes are written through the shared
 * {@code FileStorageService} on the filesystem, outside any transaction, so a rollback
 * leaves the stored file behind — that is the pre-existing behaviour of the storage layer
 * (the same is true of every other attachment flow in this application), not something this
 * migration introduced, and it is stated here rather than silently changed.
 *
 * <p>The window also proves the row is visible to the rest of the transaction before it
 * ends, which is what makes a caller's later failure able to undo it.
 */
@SpringBootTest
class ProductionAttachmentAtomicityTests extends AbstractSecurityTest {

    private static final String MODULE = "PRODUCTION_ORDER";

    @Autowired
    private ProductionAttachmentService attachmentService;

    @Autowired
    private SalesAttachmentRepository attachmentRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private static long moduleId() {
        return 9_200_000_000L + (System.nanoTime() % 1_000_000L);
    }

    private static MultipartFile file() {
        return new MockMultipartFile("file", "p5-atomicity.txt", "text/plain",
                "P5 atomicity".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void anUploadInsideAFailingTransactionLeavesNoRowBehind() {
        long orderId = moduleId();
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);

        transaction.executeWithoutResult(status -> {
            attachmentService.addAttachment(MODULE, orderId, file());

            // Visible inside the caller's transaction ...
            assertThat(attachmentRepository
                    .findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, orderId))
                    .as("the row must be part of the caller's transaction, not a new one")
                    .hasSize(1);

            // ... and undone with it when the caller fails.
            status.setRollbackOnly();
        });

        assertThat(attachmentRepository
                .findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, orderId))
                .as("a REQUIRES_NEW boundary in the port would have left this row committed")
                .isEmpty();
    }

    @Test
    void anUploadInACommittedTransactionIsPersistedAndListed() {
        long orderId = moduleId();
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);

        Long attachmentId = transaction.execute(status ->
                attachmentService.addAttachment(MODULE, orderId, file()).id());

        assertThat(attachmentId).isNotNull();
        assertThat(attachmentRepository
                .findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, orderId))
                .hasSize(1);
        assertThat(attachmentService.getAttachments(MODULE, orderId))
                .singleElement()
                .satisfies(ref -> {
                    assertThat(ref.id()).isEqualTo(attachmentId);
                    assertThat(ref.name()).isEqualTo("p5-atomicity.txt");
                    assertThat(ref.contentType()).isEqualTo("text/plain");
                    assertThat(ref.url()).startsWith("http://localhost:8080/v1/files/");
                });
    }

    @Test
    void aDeletionInsideARolledBackTransactionKeepsTheRow() {
        long orderId = moduleId();
        Long attachmentId = new TransactionTemplate(transactionManager)
                .execute(status -> attachmentService.addAttachment(MODULE, orderId, file()).id());
        assertThat(attachmentId).isNotNull();

        // No mid-transaction read: a removed entity is not readable through the persistence
        // context. The rollback read below is the discriminating evidence — a delete that had
        // run in its own transaction would already be committed and could not come back.
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            attachmentService.deleteAttachment(MODULE, orderId, attachmentId);
            status.setRollbackOnly();
        });

        assertThat(attachmentRepository.findById(attachmentId))
                .as("rolling the caller back must restore the row it deleted")
                .isPresent();
    }
}
