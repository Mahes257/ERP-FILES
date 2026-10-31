package com.vishatech.erp.service;

import com.vishatech.erp.pdf.DocumentHtml;
import com.vishatech.erp.pdf.DocumentView;
import com.vishatech.erp.production.api.ModelConversionJobPort;
import com.vishatech.erp.production.api.ModelConversionJobPort.ModelFacts;
import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;
import com.vishatech.erp.production.api.ProductionDocumentPort;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Inert, test-only regression fixture: a consumer that depends on the two
 * Production contracts §14.13 introduced and on nothing else.
 *
 * <p>Where {@code PdfProductionRegressionProbe} and
 * {@code CadJobProductionRegressionProbe} must <em>fail</em> the
 * {@code outside_does_not_depend_on_production_persistence} rule, this one must pass
 * with no freeze in place: it names the published ports, their nested value types
 * ({@code ModelFacts}, {@code ConversionOutcome}) and the shared document toolkit —
 * the legal shape of consuming Production documents and model facts from outside the
 * module. It deliberately lives in the shared {@code service} package <em>and</em> avoids
 * a {@code Production*} name, because either one would make the ownership predicate
 * classify it as production-owned and take it out of the rule's source scope — a probe
 * the rule never looks at proves nothing. Not a Spring bean, never annotated, never
 * instantiated.
 */
public class ContractConsumerProbe {

    private final ProductionDocumentPort documents;
    private final ModelConversionJobPort conversions;

    public ContractConsumerProbe(ProductionDocumentPort documents,
                                 ModelConversionJobPort conversions) {
        this.documents = documents;
        this.conversions = conversions;
    }

    /** The tracker document, described by the module and rendered by the shared pipeline. */
    public String renderTracker(Long id) {
        return documents.productionTracker(id).map(DocumentHtml::render).orElse(null);
    }

    /** The model facts plus one reported outcome, all through the published vocabulary. */
    public String queue(Long modelId) {
        Optional<ModelFacts> facts = conversions.find(modelId);
        if (facts.isEmpty()) {
            return null;
        }
        conversions.recordOutcome(modelId, ConversionOutcome.queued(Instant.now()));
        return ModelConversionJobPort.NOT_REQUIRED + ":" + facts.get().fileType();
    }

    /** A document row built with the neutral view type only. */
    public List<DocumentView.Field> rows() {
        return List.of(DocumentView.field("Status", "OK"));
    }
}
