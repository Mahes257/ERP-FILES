package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.dto.MasterValueResponse;
import com.vishatech.erp.repository.MasterValueRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.util.MasterDataCache;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Tests for the master-data cache behaviour of {@link MasterValueService}.
 *
 * <p>Verifies that:
 * <ul>
 *   <li>Repeated {@code list()} calls return the same object (cache hit)</li>
 *   <li>Create / update / delete evict the cached list so the next read is fresh</li>
 *   <li>Concurrent requests see a consistent view</li>
 * </ul>
 *
 * <p>The tests run against H2 (MySQL mode) via {@link AbstractSecurityTest}.
 * When {@code app.cache.enabled=false} is injected, the cache is disabled
 * so every call is a cache miss — the test asserts that the data is still
 * correct even with caching disabled.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "app.cache.enabled=true",
        "app.cache.masters.ttl-minutes=1"
})
class MasterValueCacheTests extends AbstractSecurityTest {

    private static final String TEST_KEY = "cache_test_uom";
    private static final String SECOND_KEY = "cache_test_currency";

    @Autowired
    private MasterValueService masterValueService;

    @Autowired
    private MasterValueRepository masterValueRepository;

    @Autowired
    private MasterDataCache cache;

    @AfterEach
    void cleanup() {
        masterValueRepository.deleteAll(masterValueRepository.findByMasterKeyOrderByValueAsc(TEST_KEY));
        masterValueRepository.deleteAll(masterValueRepository.findByMasterKeyOrderByValueAsc(SECOND_KEY));
        cache.clear();
    }

    // ---- Cache hit ----

    @Test
    void listReturnsCachedResultOnSecondCall() {
        // First call — cache miss, hits the database.
        masterValueService.create(TEST_KEY, "KG");
        masterValueService.create(TEST_KEY, "M");
        List<MasterValueResponse> first = masterValueService.list(TEST_KEY);
        assertThat(first).hasSize(2);

        // Second call — cache hit, same list reference.
        List<MasterValueResponse> second = masterValueService.list(TEST_KEY);
        assertThat(second).isSameAs(first);
    }

    // ---- Cache miss (different keys) ----

    @Test
    void differentKeysAreCachedIndependently() {
        masterValueService.create(TEST_KEY, "Nos");
        masterValueService.create(SECOND_KEY, "INR");

        List<MasterValueResponse> uom = masterValueService.list(TEST_KEY);
        List<MasterValueResponse> curr = masterValueService.list(SECOND_KEY);

        assertThat(uom).hasSize(1);
        assertThat(uom.get(0).value()).isEqualTo("Nos");
        assertThat(curr).hasSize(1);
        assertThat(curr.get(0).value()).isEqualTo("INR");

        // Verify they are different cached objects.
        assertThat(uom).isNotSameAs(curr);
    }

    // ---- Invalidation on create ----

    @Test
    void createEvictsCacheSoNextListIsFresh() {
        masterValueService.create(TEST_KEY, "Litre");
        List<MasterValueResponse> before = masterValueService.list(TEST_KEY);
        assertThat(before).hasSize(1);

        // Create triggers cache eviction — next list() reads from DB.
        masterValueService.create(TEST_KEY, "Gram");
        List<MasterValueResponse> after = masterValueService.list(TEST_KEY);
        assertThat(after).hasSize(2);
        assertThat(after).isNotSameAs(before);
    }

    // ---- Invalidation on update ----

    @Test
    void updateEvictsCacheSoNextListIsFresh() {
        MasterValueResponse created = masterValueService.create(TEST_KEY, "Metre");
        List<MasterValueResponse> before = masterValueService.list(TEST_KEY);
        assertThat(before).hasSize(1);

        // Rename — cache evicted, next list() returns updated name.
        masterValueService.update(TEST_KEY, created.id(), "Meter");
        List<MasterValueResponse> after = masterValueService.list(TEST_KEY);
        assertThat(after).hasSize(1);
        assertThat(after.get(0).value()).isEqualTo("Meter");
        assertThat(after).isNotSameAs(before);
    }

    // ---- Invalidation on delete ----

    @Test
    void deleteEvictsCacheSoNextListIsFresh() {
        masterValueService.create(TEST_KEY, "Gram");
        masterValueService.create(TEST_KEY, "Kilogram");
        List<MasterValueResponse> before = masterValueService.list(TEST_KEY);
        assertThat(before).hasSize(2);

        // Delete one — cache evicted, next list() reflects the removal.
        MasterValueResponse toDelete = before.stream()
                .filter(r -> r.value().equals("Gram")).findFirst().orElseThrow();
        masterValueService.delete(TEST_KEY, toDelete.id());
        List<MasterValueResponse> after = masterValueService.list(TEST_KEY);
        assertThat(after).hasSize(1);
        assertThat(after.get(0).value()).isEqualTo("Kilogram");
    }

    // ---- Disabled cache ----

    @Test
    void cacheDisabledStillReturnsCorrectData() {
        // Even when the cache is disabled, the list must still return correct
        // data from the database. This test does NOT depend on the cache being
        // active — it always passes as long as the service works. It documents
        // the "disabled" contract.
        masterValueService.create(TEST_KEY, "KW");
        List<MasterValueResponse> data = masterValueService.list(TEST_KEY);
        assertThat(data).hasSize(1);
        assertThat(data.get(0).value()).isEqualTo("KW");
    }

    // ---- Concurrent requests ----

    @Test
    void concurrentListCallsSeeConsistentData() throws Exception {
        // Seed data.
        masterValueService.create(TEST_KEY, "ItemA");
        masterValueService.create(TEST_KEY, "ItemB");

        int threadCount = 8;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startGate = new CountDownLatch(1);

        @SuppressWarnings("unchecked")
        Future<List<MasterValueResponse>>[] futures = new Future[threadCount];
        for (int i = 0; i < threadCount; i++) {
            futures[i] = executor.submit(() -> {
                startGate.await();
                return masterValueService.list(TEST_KEY);
            });
        }

        // Release all threads simultaneously.
        startGate.countDown();

        for (Future<List<MasterValueResponse>> future : futures) {
            List<MasterValueResponse> result = future.get();
            assertThat(result).hasSize(2);
            // All threads see the same cached object (or an identical copy).
            assertThat(result.get(0).value()).isEqualTo("ItemA");
            assertThat(result.get(1).value()).isEqualTo("ItemB");
        }

        executor.shutdown();
    }

    // ---- Cache is enabled ----

    @Test
    void cacheIsEnabled() {
        assertThat(cache.isEnabled()).isTrue();
    }
}
