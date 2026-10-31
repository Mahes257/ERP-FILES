package com.vishatech.erp.cad;

import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelConversionStatus;
import com.vishatech.erp.repository.production.ModelRepository;

/**
 * Test-only probe: the CAD engine → Production persistence dependencies that used to be
 * frozen in {@code OUTSIDE_TO_PRODUCTION_PERSISTENCE_ALLOWLIST}, deliberately
 * re-introduced so the guard can prove it still catches them.
 *
 * <p>The freeze carried two {@code cad} entries — {@code CadModelProjection} projecting
 * {@code entity.production.Model} and {@code ConversionProviderRegistry} consulting
 * {@code entity.production.ModelConversionStatus}. Both were migrated onto published or
 * CAD-owned contracts and their entries were deleted, which is only credible if the rule
 * still fails when that shape comes back: this class is that shape. It lives in the same
 * package as the real engine classes and injects the model repository, reads the model
 * entity and writes the production status vocabulary — the exact edge the rule forbids.
 *
 * <p><b>Inert by construction.</b> No Spring annotation, no component scan, never
 * instantiated, and excluded from every production-wide ArchUnit import
 * ({@code ImportOption.DoNotIncludeTests}). It exists in {@code src/test/java} only, so no
 * class file of it ever reaches the application jar.
 */
public final class CadProductionRegressionProbe {

    private final ModelRepository models;

    public CadProductionRegressionProbe(ModelRepository models) {
        this.models = models;
    }

    /** The projection dependency: the production model entity, read and written. */
    String project(Long modelId, String status) {
        Model model = models.findById(modelId).orElse(null);
        if (model == null) {
            return null;
        }
        model.setConversionStatus(status);
        return model.getConversionStatus();
    }

    /**
     * The classification dependency: a method call on the production conversion-status
     * type, which is what {@code ConversionProviderRegistry} used to make. (Reading a
     * {@code static final String} constant would not do it — javac inlines constants, so
     * only a real method call creates the class-file dependency this rule detects.)
     */
    boolean isInFlight(String status) {
        return ModelConversionStatus.isInFlight(status);
    }
}
