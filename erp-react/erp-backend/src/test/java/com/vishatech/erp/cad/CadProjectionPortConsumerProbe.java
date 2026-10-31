package com.vishatech.erp.cad;

import com.vishatech.erp.production.api.ModelConversionProjectionPort;
import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;
import java.nio.file.Path;
import java.time.Instant;

/**
 * Test-only probe: what the shared CAD engine <em>is</em> allowed to depend on.
 *
 * <p>The other half of the proof that the two {@code cad} allow-list entries could be
 * deleted. Removing a freeze is only safe if the contracts the migration introduced stay
 * legal, so this class reports a conversion outcome through the published Production
 * contract — {@code production.api.ModelConversionProjectionPort} and its nested
 * {@code ConversionOutcome} — and classifies formats through the CAD-owned
 * {@code CadFileTypes}. The outside → production rule must report none of it.
 *
 * <p><b>Inert by construction</b>: no Spring annotation, never instantiated, and only ever
 * imported explicitly by {@code CadProductionBoundaryTests}.
 */
public final class CadProjectionPortConsumerProbe {

    private final ModelConversionProjectionPort projection;

    public CadProjectionPortConsumerProbe(ModelConversionProjectionPort projection) {
        this.projection = projection;
    }

    /** The published contract: legal for the engine to depend on. */
    void reportCompleted(Path outputPath) {
        projection.recordConversionOutcome(
                ConversionOutcome.ready(Instant.now(), outputPath.toString()));
    }

    /** The CAD-owned catalogue: format capability knowledge stays in this module. */
    boolean browserViewable(String fileType) {
        return CadFileTypes.isBrowserNative(fileType);
    }

    /** The raw stage enum, reachable without any production import. */
    ConversionOutcome.Stage stageFor(String jobStatus) {
        return CadModelProjection.outcomeFor(jobStatus, null, null).stage();
    }
}
