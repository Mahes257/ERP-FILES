package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.dto.MasterValueResponse;
import com.vishatech.erp.repository.MasterValueRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.util.MasterDataCache;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Verifies that master data CRUD works correctly when the cache is disabled
 * ({@code app.cache.enabled=false}). Every list() call should hit the
 * database directly.
 */
@SpringBootTest
@TestPropertySource(properties = "app.cache.enabled=false")
class MasterValueCacheDisabledTests extends AbstractSecurityTest {

    private static final String TEST_KEY = "cache_disabled_test";

    @Autowired
    private MasterValueService masterValueService;

    @Autowired
    private MasterValueRepository masterValueRepository;

    @Autowired
    private MasterDataCache cache;

    @AfterEach
    void cleanup() {
        masterValueRepository.deleteAll(masterValueRepository.findByMasterKeyOrderByValueAsc(TEST_KEY));
    }

    @Test
    void cacheIsDisabled() {
        assertThat(cache.isEnabled()).isFalse();
    }

    @Test
    void listReturnsCorrectDataWithoutCache() {
        masterValueService.create(TEST_KEY, "Alpha");
        masterValueService.create(TEST_KEY, "Beta");

        List<MasterValueResponse> list = masterValueService.list(TEST_KEY);
        assertThat(list).hasSize(2);
        assertThat(list.get(0).value()).isEqualTo("Alpha");
        assertThat(list.get(1).value()).isEqualTo("Beta");
    }

    @Test
    void createUpdateDeleteWorkWithoutCache() {
        MasterValueResponse created = masterValueService.create(TEST_KEY, "Before");
        assertThat(masterValueService.list(TEST_KEY)).hasSize(1);

        masterValueService.update(TEST_KEY, created.id(), "After");
        List<MasterValueResponse> afterUpdate = masterValueService.list(TEST_KEY);
        assertThat(afterUpdate).hasSize(1);
        assertThat(afterUpdate.get(0).value()).isEqualTo("After");

        masterValueService.delete(TEST_KEY, created.id());
        assertThat(masterValueService.list(TEST_KEY)).isEmpty();
    }

    @Test
    void everyListCallHitsDatabase() {
        // No cache means each call returns a fresh list (not the same object).
        masterValueService.create(TEST_KEY, "X");
        List<MasterValueResponse> first = masterValueService.list(TEST_KEY);
        List<MasterValueResponse> second = masterValueService.list(TEST_KEY);
        // Without cache, the service always returns a new list instance.
        assertThat(first).isNotSameAs(second);
    }
}
