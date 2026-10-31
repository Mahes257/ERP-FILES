package com.vishatech.erp.service.production;

import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelConversionStatus;
import com.vishatech.erp.production.api.ModelConversionJobPort;
import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;
import com.vishatech.erp.repository.production.ModelRepository;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The production-owned adapter behind {@link ModelConversionJobPort}: it reads the
 * {@code models} row the CAD job pipeline needs and records the outcome the
 * pipeline reports on it.
 *
 * <p><b>What moved here, and what did not.</b> The ERP-side CAD job service used
 * to hold {@code ModelRepository} and the {@code Model} entity itself: it looked
 * the model up, read its file columns and conversion projection, and saved it
 * after reporting a job state. Those calls are the ones this adapter now makes; the
 * pipeline keeps every decision it made before (which format is browser-native,
 * whether the source file is still on disk, queue depth, engine availability,
 * duplicate-in-flight reuse, the size limit, the preview cache) and no longer names
 * a production entity or repository at all.
 *
 * <p>The two calls are deliberately mechanical, because the behaviour they must
 * preserve is in the ordering:
 *
 * <ul>
 *   <li>{@link #find(Long)} is the original
 *       {@code modelRepository.findById(modelId).orElse(null)} — an empty result
 *       for a missing row, never an exception, so the caller keeps raising its own
 *       {@code NoSuchElementException} 404 and the cancel path keeps skipping a
 *       model that is gone.</li>
 *   <li>{@link #recordOutcome(Long, ConversionOutcome)} is the original
 *       "load, apply the projection, save" sequence. It joins the caller's
 *       transaction, so the entity it loads is the same managed instance the
 *       caller's transaction would have loaded, and dirty checking commits exactly
 *       as before; the explicit save is kept because the original code saved
 *       explicitly.</li>
 * </ul>
 *
 * <p>Only {@code repository.production} is touched (a packaged production
 * repository), so this class adds no dependency on the flat persistence packages.
 */
@Service
public class ModelConversionJobAdapter implements ModelConversionJobPort {

    private final ModelRepository models;

    public ModelConversionJobAdapter(ModelRepository models) {
        this.models = models;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ModelFacts> find(Long modelId) {
        if (modelId == null) {
            return Optional.empty();
        }
        return models.findById(modelId).map(ModelConversionJobAdapter::factsOf);
    }

    @Override
    @Transactional
    public void recordOutcome(Long modelId, ConversionOutcome outcome) {
        if (modelId == null || outcome == null) {
            return;
        }
        models.findById(modelId).ifPresent(model -> {
            model.recordConversionOutcome(outcome);
            models.save(model);
        });
    }

    /**
     * The projection's facts as the pipeline's own value type.
     *
     * <p>{@code previewConverted} is the one interpretation this adapter performs,
     * and it belongs here: whether a conversion status means "a preview exists" is
     * the column's vocabulary, which Production owns. The caller still decides
     * whether that preview is on *its* disk.
     */
    private static ModelFacts factsOf(Model model) {
        return new ModelFacts(
                model.getId(),
                model.getFileType(),
                model.getFileSize(),
                model.getFileChecksum(),
                model.getFilePath(),
                ModelConversionStatus.READY.equals(model.getConversionStatus()),
                model.getConvertedFilePath());
    }
}
