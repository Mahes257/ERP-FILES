package com.vishatech.erp.service.cad;

import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelConversionStatus;
import com.vishatech.erp.repository.production.ModelRepository;

/**
 * Inert, test-only regression fixture: the dependency that
 * {@code CadConversionJobService} used to have on production persistence, written
 * out again in the same package.
 *
 * <p>Not a Spring bean, never annotated, never instantiated, never in an
 * application jar — it exists only so the
 * {@code outside_does_not_depend_on_production_persistence} rule has a
 * reintroduction of the exact migrated edge to report. §14.13 deleted the last two
 * entries of that rule's freeze, and a deleted freeze is only defensible if the
 * guard provably still bites.
 *
 * <p>The status type is used through a <em>method call</em> on purpose: reading a
 * {@code static final String} constant would be inlined by javac and create no
 * class-file edge at all, so a constant-only probe would prove nothing.
 */
public class CadJobProductionRegressionProbe {

    private final ModelRepository models;

    public CadJobProductionRegressionProbe(ModelRepository models) {
        this.models = models;
    }

    public boolean queue(Long modelId) {
        Model model = models.findById(modelId).orElse(null);
        if (model == null) {
            return false;
        }
        boolean alreadyInFlight = ModelConversionStatus.isInFlight(model.getConversionStatus());
        model.setConversionStatus(ModelConversionStatus.QUEUED);
        models.save(model);
        return alreadyInFlight;
    }
}
