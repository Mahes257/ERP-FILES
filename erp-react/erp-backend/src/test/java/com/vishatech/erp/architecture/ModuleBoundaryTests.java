package com.vishatech.erp.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import java.util.List;
import java.util.Set;
import com.vishatech.erp.crm.entity.Contact;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.CustomerAttachment;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.crm.entity.FollowUpAttachment;
import com.vishatech.erp.crm.entity.Lead;

/**
 * Executable module boundaries for the ERP modular monolith.
 *
 * <p>This suite is the executable half of {@code MODULAR_MONOLITH_FOUNDATION.md}.
 * It is <b>test-scope only</b>: it does not run at application startup and is
 * not packaged into the bootable jar, so the deployed artifact, API routes,
 * schema and runtime behaviour are unchanged.
 *
 * <p>Two kinds of rule are used, deliberately:
 *
 * <ul>
 *   <li><b>Enforced rules</b> — boundaries that already hold today. They are
 *       asserted directly and can never regress.</li>
 *   <li><b>Frozen rules</b> — boundaries the current code violates. The
 *       violating classes are listed explicitly in a {@code *_ALLOWLIST}
 *       constant, so the rule fails only when a <em>new</em> class starts
 *       violating the boundary. This is what lets the rules land today without
 *       a large package move: they stop the bleeding immediately, and every
 *       migrated module <em>shrinks</em> an allow-list.
 *       An explicit allow-list is used instead of {@code FreezingArchRule} so no
 *       violation-store file has to be generated or committed and the frozen set
 *       is reviewable in code. Removing an entry is always safe; adding one is an
 *       architectural decision that must be justified in the foundation report.</li>
 * </ul>
 *
 * <p>Nothing here asserts anything about the React frontend, API routes,
 * authentication, the database schema or runtime configuration.
 *
 * <p><b>Dashboard package coverage.</b> The dashboard classes now live in
 * {@code com.vishatech.erp.dashboard.{controller,service,dto,port}}. Every rule
 * that used to catch them through {@code com.vishatech.erp.service..} or
 * {@code com.vishatech.erp.controller..} names the dashboard package explicitly
 * as well, so the relocation could not silently remove coverage. The dashboard
 * package is deliberately <em>not</em> added to the frozen rules' source scopes
 * beyond the two places where a dashboard class is the violator
 * ({@code controllers_do_not_depend_on_repositories} and
 * {@code outside_does_not_depend_on_production_persistence}); remaining on the
 * enforced side is what makes the dashboard surface verifiably clean.
 *
 * <p><b>Purchase boundary hardening.</b> The Purchase read-only audit measured
 * two gaps in this suite and both are closed here: the business-module prefix
 * list (which <em>is</em> the Purchase isolation guard) omitted several real
 * business types, and CPR → Purchase had no rule at all because CPR lives in the
 * flat layer packages. See {@link #BUSINESS_MODULE_PREFIXES} and
 * {@link #cpr_does_not_depend_on_purchase_internals}. Shared audit
 * infrastructure stayed out of the business prefix list on purpose: the shared
 * audit contract lives in {@code com.vishatech.erp.audit} and must remain
 * importable by every module.
 */
@AnalyzeClasses(
        packages = "com.vishatech",
        importOptions = ImportOption.DoNotIncludeTests.class)
class ModuleBoundaryTests {

    /**
     * Business (non-shared) module class-name prefixes. The modules are
     * separated by class-name prefix today, not by package, which is why the
     * isolation rules are name-based until the package move happens.
     *
     * <p><b>Why this list was extended (Purchase audit hardening).</b> The only
     * consumer of this list is
     * {@link #purchase_does_not_depend_on_other_business_modules}, so the
     * completeness of the list <em>is</em> the strength of the Purchase
     * isolation guard. The Purchase audit measured that several business types
     * were missing, i.e. Purchase could have imported them without failing any
     * rule. Each addition below was inspected first and verified to be a
     * business module (or a business sub-module), never shared platform code:
     *
     * <ul>
     *   <li>{@code Dispatch}, {@code Drawing}, {@code Model},
     *       {@code TechnicalVerification} — production workflows that live in the
     *       packaged {@code entity.production.*} / {@code service.production.*}
     *       namespaces (so the production <em>package</em> rules already catch
     *       them) but which this name-based list did not name. The
     *       {@code TechnicalVerification} prefix additionally covers CPR's flat
     *       {@code entity.TechnicalVerificationStatus}, referenced only by
     *       {@code CprService} and {@code CprTechnicalVerification*}.</li>
     *   <li>{@code QualityInspection} — a genuine blind spot until §14.14: the whole
     *       workflow ({@code entity.QualityInspection},
     *       {@code service.QualityInspectionService},
     *       {@code repository.QualityInspectionRepository} and their controller) used to
     *       sit in the flat layer, so nothing but this list stopped a Purchase class
     *       from reading quality persistence. It now lives in the {@code *.production}
     *       packages like the rest of the module, and the prefix stays in this vocabulary
     *       because the module it names is still called that.</li>
     *   <li>{@code Product} — the {@code products} master-data module
     *       ({@code entity.Product}, {@code repository.ProductRepository},
     *       {@code controller.ProductController}; nothing else references it).
     *       Purchase stores product <em>names</em>
     *       as strings, so a future catalog read has to be a deliberate,
     *       reviewable port instead of a silent entity import.</li>
     *   <li>{@code QuestionnaireForm}, {@code QForm} — Marketing's form
     *       sub-module ({@code QuestionnaireForm*}, {@code QFormAttachment*});
     *       every consumer of those classes is a {@code Marketing*} class today.</li>
     * </ul>
     *
     * <p><b>Deliberately NOT added, and why.</b> {@code Audit*} is
     * <em>shared</em> infrastructure, not a business module: {@code AuditModule}
     * enumerates PURCHASE/SALES/…, both Purchase and production write through it,
     * and the shared audit contract now lives in the neutral
     * {@code com.vishatech.erp.audit} package. Listing it here would forbid the
     * shared dependency that is supposed to be legal for every module.
     * {@code ShopFloor} and {@code Maintenance} have no classes in this codebase,
     * so no prefix is invented for them. {@code Document*}/{@code Attachment*},
     * {@code Notification}, {@code User*}, {@code RefreshToken},
     * {@code Settings*}, {@code AppSetting}, {@code MasterValue},
     * {@code GridConfig*}, {@code EditHistory*}, {@code RecordRevision*},
     * {@code ProcessingJob*}, {@code Location*}, {@code Plant*}, {@code City},
     * {@code StateRegion}, {@code Country}, {@code District} and the audit-trail
     * child rows ({@code Activity}, {@code Note}, {@code HistoryEntry},
     * {@code TimelineEntry}) are shared platform/master data used across modules
     * and stay out of this list on purpose.
     */
    private static final List<String> BUSINESS_MODULE_PREFIXES = List.of(
            "Sales", "Quotation", "DeliveryChallan", "ProformaInvoice",
            "CreditNote", "PaymentReceipt", "Invoice",
            "Customer", "Contact", "Lead", "FollowUp",
            "Cpr", "PrReference",
            "CostWorkout", "ProfitWorkout", "ExchangeRate",
            "Marketing", "QuestionnaireForm", "QForm",
            "Production", "PackingList", "Dispatch", "QualityInspection",
            "Drawing", "Model", "TechnicalVerification",
            "Product");

    /**
     * Modules Marketing is verified NOT to touch at all. CRM ({@code Customer},
     * {@code Lead}) and the sales attachment table are excluded here because
     * Marketing does depend on them today — that dependency is covered by the
     * frozen rule below instead.
     */
    private static final List<String> MODULES_MARKETING_MUST_NOT_TOUCH = List.of(
            "Production", "PackingList",
            "CostWorkout", "ProfitWorkout", "ExchangeRate",
            "Cpr", "PrReference",
            "Quotation", "DeliveryChallan", "ProformaInvoice",
            "CreditNote", "PaymentReceipt", "Invoice", "Purchase");

    /** CRM / sales classes Marketing must not reach (currently violated). */
    private static final List<String> CRM_AND_SALES_PREFIXES =
            List.of("Customer", "Lead", "Contact", "FollowUp", "Sales");

    /** Modules CRM is verified never to touch: enforced, no allow-list. */
    private static final List<String> CRM_MUST_NOT_TOUCH =
            List.of("Production", "PackingList", "Marketing", "Purchase");

    /**
     * The sales document chain. CRM reads it in exactly one place — the
     * customer statement — which is the coupling the allow-list below freezes.
     */
    private static final List<String> SALES_CHAIN_PREFIXES = List.of(
            "Quotation", "DeliveryChallan", "ProformaInvoice", "CreditNote",
            "Invoice", "PaymentReceipt", "Sales");

    /**
     * Frozen: files outside the CRM module that still read CRM entities or CRM
     * repositories directly. Every entry is a known, documented coupling; the
     * target state is the CRM query API described in CRM_MODULE_REFACTOR.md.
     * <!-- MEASURED -->
     *
     * <p>The ERP dashboard's controller and service used to be listed here. They
     * now read CRM through {@code CrmDashboardPort}, so their entries were removed
     * and the rule covers them again. The Sales Dashboard aggregation followed the
     * same path: its entry is gone too, which is why this rule is now the enforced
     * boundary for CRM rather than a frozen exception list.
     */
    private static final Set<String> OUTSIDE_TO_CRM_INTERNALS_ALLOWLIST = Set.of(
            // Lead's child tables: they declare @ManyToOne Lead and still live in
            // the shared entity package, so the association itself is the edge
            "com.vishatech.erp.entity.Activity",
            "com.vishatech.erp.entity.Attachment",
            "com.vishatech.erp.entity.HistoryEntry",
            "com.vishatech.erp.entity.Note",
            "com.vishatech.erp.entity.TimelineEntry",
            // master-data "is it in use" checks
            "com.vishatech.erp.service.LocationMasterService",
            "com.vishatech.erp.service.MasterValueService",
            // sales document chain reading the customer master
            "com.vishatech.erp.service.QuotationService",
            "com.vishatech.erp.service.ProfitWorkoutService",
            // CPR -> CRM convert-to-customer
            "com.vishatech.erp.service.CprService",
            "com.vishatech.erp.service.CprTechnicalVerificationService",
            // marketing visits, map and travel plans
            "com.vishatech.erp.service.MarketingVisitService",
            "com.vishatech.erp.service.MarketingMapService",
            // document repository backfill and per-module visibility
            "com.vishatech.erp.service.DocumentBackfillService",
            // PDF rendering of the CRM documents
            "com.vishatech.erp.service.PdfGenerationService");

    /**
     * Frozen: CRM files that read the sales document chain (the customer
     * statement). <!-- MEASURED -->
     */
    private static final Set<String> CRM_TO_SALES_CHAIN_ALLOWLIST = Set.of(
            // CustomerService.getStatement() reads invoices and payment receipts
            // to build the customer account statement.
            "com.vishatech.erp.crm.service.CustomerService");

    // ---------------------------------------------------------------------
    // Frozen sets: the classes allowed to violate each boundary TODAY.
    // Removing an entry is always safe. Adding one is an architectural
    // decision and must be justified in MODULAR_MONOLITH_FOUNDATION.md.
    // ---------------------------------------------------------------------

    /**
     * Controllers that inject a repository directly instead of going through a
     * service. {@code QualityInspectionController} and
     * {@code MarketingVisitActivityController} are NOT listed: they depend on
     * entities only, not on repositories. The ERP dashboard controller's entry
     * was removed once it stopped injecting repositories at all.
     */
    private static final Set<String> CONTROLLER_TO_REPOSITORY_ALLOWLIST = Set.of(
            "com.vishatech.erp.controller.ExpenseTripController",
            "com.vishatech.erp.controller.FileController",
            "com.vishatech.erp.controller.ProductController",
            "com.vishatech.erp.controller.QuestionnaireFormController",
            "com.vishatech.erp.controller.RecordRevisionController",
            "com.vishatech.erp.controller.UserController");

    /**
     * The eight attachment entities that register
     * {@code AttachmentStorageLedgerListener} through {@code @EntityListeners}.
     * This is the only entity → service edge in the codebase and it is
     * deliberate: the listener keeps the shared storage ledger correct inside
     * the transaction that writes the attachment row.
     */
    private static final Set<String> ENTITY_TO_SERVICE_ALLOWLIST = Set.of(
            "com.vishatech.erp.entity.Attachment",
            "com.vishatech.erp.entity.CprAttachment",
            "com.vishatech.erp.crm.entity.CustomerAttachment",
            "com.vishatech.erp.crm.entity.FollowUpAttachment",
            "com.vishatech.erp.entity.MarketingExpenseAttachment",
            "com.vishatech.erp.entity.PurchaseAttachment",
            "com.vishatech.erp.entity.QFormAttachment",
            "com.vishatech.erp.entity.SalesAttachment");

    /**
     * Production-owned services that reach into the flat repository/entity packages.
     *
     * <p><b>Scope (P7).</b> The source scope is {@link #productionOwnedServices()} — the
     * same package-based scope the Production → Sales rule uses — not the
     * {@code haveSimpleNameStartingWith("Production")} name prefix this rule shipped
     * with. That prefix silently skipped every production service whose name does not
     * start with {@code Production}: {@code ModelService}, {@code DrawingService},
     * {@code DispatchService}, {@code PackingListService} and the rest of
     * {@code service.production}. Widening the scope surfaced the flat
     * {@code QualityInspectionService}; §14.14 then moved it — with
     * {@code ProductionTrackerService} — into that same package, so the scope is now
     * purely package-based and names no class.
     *
     * <p><b>Exact edges (measured, not assumed).</b> §14.14 moved the tracker and
     * quality-inspection persistence into {@code entity.production} /
     * {@code repository.production} and their services into {@code service.production},
     * so the five entries that named those workflows went with their tables. Evaluating
     * this rule with an empty allow-list now reports exactly one origin:
     *
     * <ul>
     *   <li>{@code ProductionSettingsService} — the shared {@code AppSetting} /
     *       {@code AppSettingRepository} settings store: platform infrastructure read by
     *       Settings, Purchase and CRM as much as by Production, so it is not
     *       production-owned persistence and moving it into {@code repository.production}
     *       would misattribute it. It is a real flat-package edge, so it stays frozen here
     *       rather than being pretended away — one narrow class entry, never a package
     *       exclusion.</li>
     * </ul>
     *
     * <p><b>The two entries that disappeared at P5/P6.</b>
     * {@code ProductionAttachmentService} (Sales attachment persistence) and
     * {@code ProductionOrderService} (Sales order persistence) were removed only after
     * their cross-module dependency had actually been migrated onto a published Sales
     * port; dropping them here is a consequence of that migration, not a reason to run
     * it. {@code ProductionBoundaryScopeTests} asserts this set is exactly what the
     * unfrozen rule reports, so no entry can be dead weight and no offender can hide
     * behind one.
     */
    static final Set<String> PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST = Set.of(
            // the shared settings store — platform infrastructure, not production
            // persistence; the only flat edge left in the module's service scope
            "com.vishatech.erp.service.production.ProductionSettingsService");

    /**
     * Non-production classes that read production persistence. The ERP dashboard
     * controller's entry was removed once it stopped reading production tables, and
     * the Sales Dashboard aggregation's entry was removed once it moved to the
     * production read port: both dashboards now reach production only through
     * {@code ProductionDashboardPort}.
     *
     * <p>The {@code PurchaseSupportService} entry is gone too: Purchase used to
     * import {@code entity.production.AuditAction}/{@code AuditModule} directly, and
     * now writes through the shared {@code com.vishatech.erp.audit} contract
     * ({@code AuditPort}/{@code AuditRecord} plus the same two enums, relocated to
     * that neutral package). Purchase imports <em>no</em> production package any
     * more, so the entry was obsolete rather than convenient — the two remaining
     * classes are unrelated to the audit work and keep their entries.
     */
    // --------------------------------------------------------- P7: no more freeze
    // The P4 freeze of Production -> Sales internals is GONE, because each of its
    // three entries was migrated onto a published Sales port by a later phase:
    //
    //   ProductionAttachmentService (P5) -> sales.api.AttachmentStorePort
    //   ProductionOrderService      (P6) -> sales.api.SalesOrderLookupPort
    //   ProductionTrackerService    (P7) -> sales.api.SalesOrderLookupPort
    //
    // Deleting an entry was always the LAST step of a phase, never the first: the
    // dependency was gone from the class before the freeze shrank, so the
    // PRODUCTION_TO_SALES_INTERNALS_ALLOWLIST constant has disappeared entirely and
    // the rule below is enforced with no allow-list at all. The evidence that removing
    // it did not weaken the guard lives in ProductionSalesBoundaryTests (probe classes
    // that reintroduce exactly those three dependencies must still be reported) and in
    // §14 of MODULAR_MONOLITH_FOUNDATION.md.

    /** Marketing services that reach into CRM / the sales attachment table. */
    private static final Set<String> MARKETING_TO_CRM_SALES_ALLOWLIST = Set.of(
            "com.vishatech.erp.service.MarketingMapService",
            "com.vishatech.erp.service.MarketingVisitService");

    /**
     * Builds a predicate that excludes a frozen allow-list, so the rule reports
     * only <em>new</em> violations.
     */
    private static DescribedPredicate<JavaClass> notIn(String what, Set<String> frozenFullNames) {
        return new DescribedPredicate<>("not in the frozen allow-list for " + what) {
            @Override
            public boolean test(JavaClass javaClass) {
                return !frozenFullNames.contains(javaClass.getFullName());
            }
        };
    }

    /** Project classes whose simple name starts with any of the given prefixes. */
    private static DescribedPredicate<JavaClass> startsWithAnyOf(String description,
                                                                List<String> prefixes) {
        return new DescribedPredicate<>(description) {
            @Override
            public boolean test(JavaClass javaClass) {
                if (!javaClass.getPackageName().startsWith("com.vishatech.erp")) {
                    return false;
                }
                String simpleName = javaClass.getSimpleName();
                return prefixes.stream().anyMatch(simpleName::startsWith);
            }
        };
    }

    /**
     * Classes belonging to a business module <em>other than</em> the given one,
     * expressed by simple-name prefix because the modules are not packages yet.
     */
    private static DescribedPredicate<JavaClass> belongsToAnotherBusinessModule(String ownPrefix) {
        return new DescribedPredicate<>("belongs to a business module other than " + ownPrefix) {
            @Override
            public boolean test(JavaClass javaClass) {
                if (!javaClass.getPackageName().startsWith("com.vishatech.erp")) {
                    return false;
                }
                String simpleName = javaClass.getSimpleName();
                return BUSINESS_MODULE_PREFIXES.stream()
                        .filter(prefix -> !prefix.equals(ownPrefix))
                        .anyMatch(simpleName::startsWith);
            }
        };
    }

    /**
     * Purchase-owned classes that are internals: its services, entities,
     * repositories, DTO containers, adapters and support helpers.
     *
     * <p>Two exemptions, both deliberately narrow, because they are the only
     * things other modules are allowed to touch:
     *
     * <ul>
     *   <li>the published ingress package ({@link #PURCHASE_INGRESS_PACKAGE}) —
     *       the port and its request/response contract;</li>
     *   <li>{@code Purchase*Port}, so the port interface stays usable wherever it
     *       lives.</li>
     * </ul>
     *
     * <p>Everything else Purchase-prefixed stays internal, including the ingress
     * adapter that implements the port and the {@code PurchaseRequisitionService}/
     * {@code PurchaseDtos} types. Only project classes are considered, so no
     * shared platform type can be caught by accident.
     *
     * <p>Package-private so {@code PurchaseIngressBoundaryTests} can assert the
     * predicate is non-vacuous and that the ingress surface really is exempt.
     */
    static DescribedPredicate<JavaClass> purchaseModuleInternals() {
        return new DescribedPredicate<>("are Purchase module internals") {
            @Override
            public boolean test(JavaClass javaClass) {
                if (!javaClass.getPackageName().startsWith("com.vishatech.erp")) {
                    return false;
                }
                if (javaClass.getPackageName().equals(PURCHASE_INGRESS_PACKAGE)
                        || javaClass.getPackageName().startsWith(PURCHASE_INGRESS_PACKAGE + ".")) {
                    return false;
                }
                String simpleName = javaClass.getSimpleName();
                return simpleName.startsWith("Purchase")
                        && !simpleName.endsWith(PURCHASE_INGRESS_PORT_SUFFIX);
            }
        };
    }

    // ----------------------------------------------------------------- layers
    // Enforced: these invariants already hold. An entity reaching back into the
    // persistence layer, or a repository depending on a service, would be a
    // genuine defect.

    @ArchTest
    static final ArchRule entities_do_not_depend_on_repositories =
            noClasses()
                    .that().resideInAnyPackage(
                            "com.vishatech.erp.entity..",
                            "com.vishatech.erp.crm.entity..")
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.repository..",
                            "com.vishatech.erp.crm.repository..");

    @ArchTest
    static final ArchRule repositories_do_not_depend_on_services_or_controllers =
            noClasses()
                    .that().resideInAnyPackage(
                            "com.vishatech.erp.repository..",
                            "com.vishatech.erp.crm.repository..")
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.service..",
                            "com.vishatech.erp.controller..",
                            "com.vishatech.erp.crm.service..",
                            "com.vishatech.erp.crm.controller..",
                            "com.vishatech.erp.dashboard..");

    @ArchTest
    static final ArchRule exception_layer_stays_leaf =
            noClasses()
                    .that().resideInAPackage("com.vishatech.erp.exception..")
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.service..",
                            "com.vishatech.erp.repository..",
                            "com.vishatech.erp.controller..",
                            "com.vishatech.erp.dashboard..");

    @ArchTest
    static final ArchRule security_does_not_depend_on_business_services =
            noClasses()
                    .that().resideInAPackage("com.vishatech.erp.security..")
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.service..",
                            "com.vishatech.erp.controller..",
                            "com.vishatech.erp.dashboard..");

    @ArchTest
    static final ArchRule util_does_not_depend_on_services_or_controllers =
            noClasses()
                    .that().resideInAPackage("com.vishatech.erp.util..")
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.service..",
                            "com.vishatech.erp.controller..",
                            "com.vishatech.erp.dashboard..");

    /**
     * The shared audit contract is neutral infrastructure and must stay that way.
     *
     * <p>{@code com.vishatech.erp.audit} holds the ERP-wide audit vocabulary
     * ({@code AuditModule}, {@code AuditAction}) and the shared write contract
     * ({@code AuditPort}, {@code AuditRecord}), i.e. the types every module is
     * allowed to depend on. If this package ever depended back on a business
     * module — a service, a controller, a repository, an entity, a business DTO —
     * it would become a bidirectional coupling hub, which is strictly worse than
     * the production-owned types it replaced. The rule is enforced (no allow-list)
     * because the package is dependency-free today.
     *
     * <p>Note the deliberate asymmetry with the audit <em>implementation</em>: the
     * implementation ({@code service.production.AuditService}, which also serves
     * the read-only {@code /audit} API and the {@code audit_logs} entity) may and
     * does depend on this package; direction matters, and this is the direction
     * that is legal.
     */
    @ArchTest
    static final ArchRule shared_audit_contract_stays_neutral =
            noClasses()
                    .that().resideInAPackage("com.vishatech.erp.audit..")
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.service..",
                            "com.vishatech.erp.controller..",
                            "com.vishatech.erp.repository..",
                            "com.vishatech.erp.entity..",
                            "com.vishatech.erp.dto..",
                            "com.vishatech.erp.dashboard..",
                            "com.vishatech.erp.crm..");

    // ------------------------------------------------------- module isolation
    // Enforced: verified true today.

    /**
     * The CAD worker runs from the same jar but must never load the ERP's web,
     * security or business layers — that is what keeps a slow or crashing CAD
     * engine from taking the ERP down. See {@code CadWorkerConfiguration}.
     */
    @ArchTest
    static final ArchRule cadworker_is_isolated_from_the_erp =
            noClasses()
                    .that().resideInAPackage("com.vishatech.cadworker..")
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.service..",
                            "com.vishatech.erp.controller..",
                            "com.vishatech.erp.security..",
                            "com.vishatech.erp.config..",
                            "com.vishatech.erp.dto..",
                            "com.vishatech.erp.util..",
                            "com.vishatech.erp.dashboard..");

    /**
     * Purchase is the most self-contained business module: it must not reach
     * into Sales, CRM, CPR, Accounts, Marketing or Production. It may use the
     * shared platform (users, notifications, file storage) and the shared audit
     * contract. This is the boundary that makes Purchase the first safe candidate
     * for its own package.
     */
    @ArchTest
    static final ArchRule purchase_does_not_depend_on_other_business_modules =
            noClasses()
                    .that().haveSimpleNameStartingWith("Purchase")
                    .should().dependOnClassesThat(belongsToAnotherBusinessModule("Purchase"));


    /**
     * Suffix that marks a Purchase-owned public ingress port. Such a type is
     * <em>not</em> a Purchase internal: it is the interface other modules are
     * meant to depend on, so {@link #purchaseModuleInternals()} deliberately
     * excludes it.
     */
    private static final String PURCHASE_INGRESS_PORT_SUFFIX = "Port";

    /**
     * The package that publishes Purchase's ingress surface: the port interface
     * and its request/response contract, nothing else.
     *
     * <p>This is the module's published API, so {@link #purchaseModuleInternals()}
     * exempts the whole package, while a {@code Purchase*Port} also stays exempt by
     * name wherever it lives. Both exemptions are asserted non-vacuous by
     * {@code PurchaseIngressBoundaryTests}.
     */
    static final String PURCHASE_INGRESS_PACKAGE = "com.vishatech.erp.purchase.api";

    /**
     * Enforced, with <b>no</b> exception: CPR must not depend on Purchase
     * service implementations, entities, repositories or internal DTOs — only on
     * the Purchase-owned ingress port and the contract it publishes.
     *
     * <p><b>Why this direction needs its own rule.</b> Purchase is the module CPR
     * writes into (a verified CPR item becomes a Purchase Requisition), and the
     * {@code purchase_does_not_depend_on_other_business_modules} rule above only
     * covers Purchase as the <em>source</em>; the CPR classes additionally live in
     * the flat {@code service}/{@code entity}/{@code controller} packages rather
     * than a {@code cpr} package, so no package-based rule reaches them either.
     *
     * <p><b>How the boundary is satisfied.</b> The conversion injects
     * {@code purchase.api.PurchaseRequisitionIngressPort} and builds
     * {@code PurchaseRequisitionIngressRequest}. The port and that contract live
     * in {@link #PURCHASE_INGRESS_PACKAGE}, which {@link #purchaseModuleInternals()}
     * exempts; {@code PurchaseRequisitionService}, {@code PurchaseDtos} and the
     * ingress adapter are <em>not</em> exempt, so a relapse fails this rule. The
     * previously frozen single-class exception
     * ({@code CprTechnicalVerificationService}) was deleted only after the
     * dependency had actually been removed — see §13 of
     * {@code MODULAR_MONOLITH_FOUNDATION.md}.
     *
     * <p>The predicate matches Purchase-prefixed project classes only, so shared
     * platform types CPR legitimately uses ({@code dto.ApiResponse},
     * {@code util.AuditContext}, exceptions, the shared
     * {@code com.vishatech.erp.audit} contract) are unaffected.
     */
    @ArchTest
    static final ArchRule cpr_does_not_depend_on_purchase_internals =
            noClasses()
                    .that().haveSimpleNameStartingWith("Cpr")
                    .should().dependOnClassesThat(purchaseModuleInternals());

    /**
     * The exact type the deleted exception used to excuse, named explicitly: the
     * conversion goes through the ingress port and never injects the requisition
     * service itself. Kept alongside the general rule so the requirement is
     * legible here and survives any future change to the name-prefix vocabulary.
     */
    @ArchTest
    static final ArchRule cpr_does_not_depend_on_the_purchase_requisition_service =
            noClasses()
                    .that().haveSimpleNameStartingWith("Cpr")
                    .should().dependOnClassesThat()
                    .haveFullyQualifiedName("com.vishatech.erp.service.PurchaseRequisitionService");

    /**
     * ... and not on Purchase's DTO container either: {@code PurchaseDtos} and every
     * record nested inside it ({@code PurchaseDtos.PurchaseItemRequest},
     * {@code PurchaseDtos.PurchaseRequisitionResponse}, ...) — the types a caller
     * used to have to assemble by hand. The predicate walks the enclosing-class
     * chain so the nested records are caught too.
     */
    @ArchTest
    static final ArchRule cpr_does_not_depend_on_purchase_dtos =
            noClasses()
                    .that().haveSimpleNameStartingWith("Cpr")
                    .should().dependOnClassesThat(purchaseDtoContainerOrItsNestedTypes());

    /** {@code dto.PurchaseDtos} and every type nested inside it. */
    private static DescribedPredicate<JavaClass> purchaseDtoContainerOrItsNestedTypes() {
        return new DescribedPredicate<>("live in the Purchase DTO container") {
            @Override
            public boolean test(JavaClass javaClass) {
                JavaClass current = javaClass;
                while (current != null) {
                    if ("PurchaseDtos".equals(current.getSimpleName())) {
                        return true;
                    }
                    current = current.getEnclosingClass().orElse(null);
                }
                return false;
            }
        };
    }

    /**
     * Marketing must not reach into Production, Accounts, CPR or the sales
     * document chain. Its genuine CRM / sales-attachment dependencies are a
     * separate, frozen boundary below.
     */
    @ArchTest
    static final ArchRule marketing_does_not_depend_on_other_business_modules =
            noClasses()
                    .that().haveSimpleNameStartingWith("Marketing")
                    .should().dependOnClassesThat(startsWithAnyOf(
                            "belongs to a module Marketing does not use",
                            MODULES_MARKETING_MUST_NOT_TOUCH));

    // ----------------------------------------------------------- frozen rules

    @ArchTest
    static final ArchRule controllers_do_not_depend_on_repositories =
            noClasses()
                    .that().resideInAnyPackage(
                            "com.vishatech.erp.controller..",
                            "com.vishatech.erp.crm.controller..",
                            "com.vishatech.erp.dashboard.controller..")
                    .and(notIn("controllers -> repositories", CONTROLLER_TO_REPOSITORY_ALLOWLIST))
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.repository..",
                            "com.vishatech.erp.crm.repository..");

    /**
     * The attachment entities register {@code AttachmentStorageLedgerListener}
     * through {@code @EntityListeners}; that is why entity → service edges
     * exist. The mechanism is deliberate, but it is also the only place where
     * the persistence layer points at the service layer, so it is frozen: no
     * <em>new</em> entity may pick up a service dependency.
     */
    @ArchTest
    static final ArchRule entities_do_not_depend_on_services =
            noClasses()
                    .that().resideInAnyPackage(
                            "com.vishatech.erp.entity..",
                            "com.vishatech.erp.crm.entity..")
                    .and(notIn("entities -> services", ENTITY_TO_SERVICE_ALLOWLIST))
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.service..",
                            "com.vishatech.erp.crm.service..");

    /**
     * Production-owned services must not read the <em>flat</em> {@code entity} /
     * {@code repository} packages: production persistence belongs in
     * {@code repository.production} / {@code entity.production}. Since §14.14 moved the
     * tracker and quality-inspection persistence and their services, the only flat edge
     * left in this scope is the shared {@code AppSetting} store, which is platform
     * infrastructure rather than production persistence; the allow-list above records it
     * — one class, not a package — and why it is not production-owned.
     *
     * <p>The CPO part of this rule's original justification is gone: Production no
     * longer resolves the Sales Order through the flat {@code SalesOrderRepository} but
     * through {@code sales.api.SalesOrderLookupPort}, so the lookup-port target named in
     * the P4 report has been met and the rule now only covers production's own flat
     * persistence.
     */
    @ArchTest
    static final ArchRule production_services_do_not_depend_on_flat_persistence =
            productionServicesDoNotDependOnFlatPersistence(
                    PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST);

    /**
     * Builds the flat-persistence rule for a given freeze. Parameterised for the same
     * reason the Sales rule was: {@code ProductionBoundaryScopeTests} evaluates this very
     * shape with an empty allow-list and requires the reported origins to be exactly the
     * frozen set, so a dead entry (or a hidden offender) fails the suite.
     */
    static ArchRule productionServicesDoNotDependOnFlatPersistence(
            Set<String> frozenAllowlist) {
        return noClasses()
                .that(productionOwnedServices())
                .and(notIn("production services -> flat persistence", frozenAllowlist))
                .should().dependOnClassesThat()
                .resideInAnyPackage(
                        "com.vishatech.erp.repository",
                        "com.vishatech.erp.entity");
    }

    /**
     * Non-production classes that read production persistence.
     *
     * <p><b>Scope (P7).</b> Two measured gaps are closed here. The <em>target</em> was
     * only {@code repository.production..} / {@code entity.production..}, so the
     * production persistence that never moved into those packages —
     * {@code entity.ProductionTracker}, {@code entity.QualityInspection},
     * {@code repository.ProductionTrackerRepository},
     * {@code repository.QualityInspectionRepository} — was invisible to this rule even
     * though {@code PdfGenerationService} reads the tracker table. The <em>source</em>
     * was limited to {@code service..} / {@code controller..} / {@code crm..} /
     * {@code dashboard..}, so a reader anywhere else (the {@code cad} engine, for
     * instance) was never checked by any rule in this suite. The source is now
     * "everything in this application that Production does not own"
     * ({@link #outsideProductionOwnership()}) and the target is production-owned
     * persistence, packaged or still flat ({@link #productionOwnedPersistence()}).
     *
     * <p><b>Exact edges (measured, not assumed).</b> The widened rule reported exactly
     * two classes at P7, and §14.13 migrated both onto published Production contracts, so
     * it now reports <em>no</em> origin at all — which is why the freeze is gone rather
     * than empty:
     *
     * <ul>
     *   <li>{@code service.PdfGenerationService} — the tracker, inspection and
     *       packing-list documents now come from
     *       {@code production.api.ProductionDocumentPort}, implemented by the
     *       production-owned {@code service.production.ProductionDocumentService}.</li>
     *   <li>{@code service.cad.CadConversionJobService} — the ERP-side CAD job pipeline
     *       reads its model facts and records its conversion outcomes through
     *       {@code production.api.ModelConversionJobPort}, implemented by
     *       {@code service.production.ModelConversionJobAdapter}.</li>
     * </ul>
     *
     * <p><b>The CAD engine's two entries are gone, not weakened.</b>
     * {@code cad.CadModelProjection} and {@code cad.ConversionProviderRegistry} used to
     * reach into {@code entity.production.Model} / {@code ModelConversionStatus}. The
     * projection now goes through the published Production contract
     * {@code production.api.ModelConversionProjectionPort} (implemented by the model
     * entity, which owns the columns) and the format classification moved to the
     * CAD-owned {@code cad.CadFileTypes}. Neither class imports a production package any
     * more, so both entries were deleted — and {@code CadProductionBoundaryTests} keeps
     * them honest: it re-introduces each dependency with a probe class that the rule must
     * report, and asserts the two former offenders have no production dependency at all.
     *
     * <p><b>Deliberately not in the target.</b> {@code entity.TechnicalVerificationStatus}
     * is a flat status enum whose ownership is shared with CPR (the CPR technical
     * verification workflow is its other writer), while {@code audit.AuditPort} and
     * {@code entity.ProcessingJobStatus} only mention production types in javadoc, which
     * creates no class-file dependency at all. None of them is production-owned
     * <em>persistence</em>, so none belongs in {@link #productionOwnedPersistence()}.
     * The dashboards, which used to be frozen here, now read production exclusively
     * through {@code dashboard.port.ProductionDashboardPort} and contribute no edge.
     *
     * <p>Everything in this application that Production does not own — the source scope of the
     * outside → production rule.
     *
     * <p>Expressed as the negation of {@link #productionOwnedTypes()} rather than as a list
     * of {@code service}/{@code controller}/{@code crm}/{@code dashboard} packages, because
     * that list <em>was</em> the measured gap: a reader in any other package (the
     * {@code cad} engine, for instance) was never checked by any rule in this suite.
     */
    static DescribedPredicate<JavaClass> outsideProductionOwnership() {
        return new DescribedPredicate<>("are outside Production's ownership") {
            @Override
            public boolean test(JavaClass javaClass) {
                return javaClass.getPackageName().startsWith("com.vishatech.erp")
                        && !productionOwnedTypes().test(javaClass);
            }
        };
    }

    // -------------------------------------------------------- P9: no more freeze
    // This rule's freeze had exactly two entries, and §14.13 migrated both of them onto
    // published Production contracts (ProductionDocumentPort for the production
    // documents, ModelConversionJobPort for the ERP-side CAD job pipeline). The constant
    // has therefore disappeared entirely — like the Production → Sales freeze before it —
    // and the rule is enforced with no allow-list at all. Removing it is only defensible
    // with evidence, and that evidence is a test class rather than a comment:
    // ProductionPersistenceBoundaryTests re-introduces each former dependency with a
    // probe class the rule must report, asserts both former offenders have no
    // production-persistence dependency left, and asserts by reflection that this class
    // carries no such field again.
    @ArchTest
    static final ArchRule outside_does_not_depend_on_production_persistence =
            outsideDoesNotDependOnProductionPersistence();

    /**
     * The outside → production rule.
     *
     * <p>Parameterless on purpose: the freeze is gone because the edges are gone, so there
     * is nothing left to parameterise. See the P9 note above for the evidence, and
     * {@link #productionServicesDoNotDependOnFlatPersistence(Set)} for the shape this rule
     * had while it still had one.
     */
    static ArchRule outsideDoesNotDependOnProductionPersistence() {
        return noClasses()
                .that(outsideProductionOwnership())
                .should().dependOnClassesThat(productionOwnedPersistence());
    }

    // --------------------------------- P4/P7: Production outbound boundaries
    // The Production audit (P4) measured that Production was the only business
    // module with no outbound guard: Purchase, CPR, Marketing and CRM each have
    // one, so nothing in this suite stopped a production service from reaching
    // straight into Sales. Sales is still a flat layer package
    // (entity/repository/dto/service) plus the com.vishatech.erp.sales package, so
    // the target set is expressed by package for the module package and by name for
    // the flat types — the same convention SALES_CHAIN_PREFIXES and
    // CRM_AND_SALES_PREFIXES already use.
    //
    // The SOURCE scope is package-based on purpose. A name-prefix scope
    // (haveSimpleNameStartingWith("Production")) silently misses every production
    // service that is not named Production* — ModelService, DrawingService,
    // DispatchService, PackingListService and the rest of the package — which is
    // precisely the blind spot the audit measured in
    // production_services_do_not_depend_on_flat_persistence. P7 therefore uses one
    // shared scope (productionOwnedServices()) for all three Production outbound
    // rules and adds the module-wide rule below it, so "Production may not import
    // another module's internals" is now enforced in every direction, not just
    // towards Sales.

    /** The packaged production service namespace (the real scope of this rule). */
    private static final String PRODUCTION_SERVICE_PACKAGE =
            "com.vishatech.erp.service.production";

    // The "production-owned services that are still flat" list this scope used to need
    // (service.QualityInspectionService, service.ProductionTrackerService) is GONE:
    // §14.14 moved both into the package above, so the scope is now exactly that package
    // and no longer names any class. Removing the list is the point of the migration —
    // a name list is a blind spot the moment someone adds a production service that is
    // not on it, which is precisely the bug P7 measured here.

    /**
     * Flat layer packages that hold Sales-owned types: the {@code Sales*} types and the
     * sales document chain. {@code controller} joined the list at P7 so a future
     * production service cannot quietly inject {@code QuotationController} or
     * {@code SalesOrderController} either.
     */
    private static final List<String> SALES_OWNED_FLAT_PACKAGES = List.of(
            "com.vishatech.erp.entity",
            "com.vishatech.erp.repository",
            "com.vishatech.erp.dto",
            "com.vishatech.erp.service",
            "com.vishatech.erp.controller");

    /**
     * The sales document chains. Their types live in the same flat packages and are
     * Sales-owned exactly as much as the {@code Sales*} types are: a
     * {@code QuotationService}, an {@code InvoiceRepository} or a
     * {@code PaymentReceiptResponse} either persists into a Sales table or serves a
     * Sales document, which is precisely what the Production → Sales rule forbids
     * Production to reach into directly. Omitting them was a target-scope gap the P4
     * audit measured (the predicate only asked for a {@code Sales} name prefix), so the
     * list is derived from {@link #SALES_CHAIN_PREFIXES} — the very list CRM's rule
     * uses — minus {@code Sales} itself, which the name category already covers.
     */
    private static final List<String> SALES_DOCUMENT_CHAIN_PREFIXES =
            SALES_CHAIN_PREFIXES.stream()
                    .filter(prefix -> !"Sales".equals(prefix))
                    .toList();

    /**
     * The production module's packaged namespaces. They are the source scope of the
     * Production → Sales rule and part of {@link #productionOwnedTypes()}.
     */
    private static final List<String> PRODUCTION_PACKAGES = List.of(
            // The module's published surface, mirroring sales.api / purchase.api: the
            // contracts other modules (here the shared CAD engine) are meant to depend
            // on. Production-owned, but never a target of the persistence rules.
            "com.vishatech.erp.production",
            "com.vishatech.erp.service.production",
            "com.vishatech.erp.controller.production",
            "com.vishatech.erp.repository.production",
            "com.vishatech.erp.entity.production",
            "com.vishatech.erp.dto.production",
            "com.vishatech.erp.util.production",
            "com.vishatech.erp.config.production");

    // The two lists that used to classify "production-owned classes that still sit in a
    // flat layer package" are GONE as well: §14.14 moved the tracker and
    // quality-inspection entity, repository, service AND controller into their
    // {@code *.production} packages, so production ownership is now expressible purely by
    // package. That is a stronger rule than the name-prefix fallback it replaces: a future
    // {@code Production*} class left in a flat package is now classified as OUTSIDE
    // production, so the outside → production rule reports it the moment it touches a
    // production table instead of quietly treating it as production's own.
    //
    // {@code TechnicalVerification*} is still deliberately not production-owned: its
    // status enum and the {@code CprTechnicalVerification*} entities belong to the CPR
    // technical-verification workflow (see the ownership note on
    // {@link #productionOwnedPersistence()}), so neither is an internal the
    // outside-world rules may enforce.

    // The four flat production-owned persistence classes this set used to name
    // (entity.ProductionTracker, entity.QualityInspection, and their repositories) are
    // GONE from the flat layer: §14.14 moved all four beside their twenty siblings in
    // entity.production / repository.production. The table names, columns and mappings
    // are unchanged — only the Java packages are.

    /** The Sales module package ({@code SalesDashboardReadAdapter} lives here today). */
    private static final String SALES_MODULE_PACKAGE = "com.vishatech.erp.sales";

    /**
     * Suffix that marks a <em>published</em> Sales port. Such a type is not Sales
     * internals: it is the interface a consuming module is meant to depend on, so the
     * predicate below deliberately lets it through.
     *
     * <p>The exemption is live since P5/P6 — {@code sales.api.AttachmentStorePort} and
     * {@code sales.api.SalesOrderLookupPort} are exactly such ports — and it is
     * deliberately as narrow as it can be: only a {@code *Port} type is exempt. The
     * adapter that implements it is <em>not</em>
     * ({@code sales.api.SalesOrderLookupAdapter} and
     * {@code service.SalesAttachmentStoreAdapter} stay Sales internals), so the
     * exemption can never hide an implementation dependency.
     * {@code ProductionSalesBoundaryTests} asserts both halves.
     */
    private static final String SALES_PUBLISHED_PORT_SUFFIX = "Port";

    /**
     * Sales-owned implementation and persistence: Sales entities, repositories, DTOs
     * and service implementations, plus everything inside the Sales module package.
     *
     * <p>The flat packages are matched by <em>exact</em> package equality and the
     * {@code Sales} simple-name prefix, never by a package prefix, so
     * {@code com.vishatech.erp.service.production}/ {@code entity.production}/ … are
     * untouched, and non-Sales-prefixed types in those same flat packages (shared
     * platform code, production DTOs, Purchase types) can never be caught by accident.
     *
     * <p>Package-private so {@code ProductionSalesBoundaryTests} can assert the
     * predicate classifies real Sales types and leaves neutral shared infrastructure
     * alone.
     */
    static DescribedPredicate<JavaClass> salesOwnedInternals() {
        return new DescribedPredicate<>("are Sales-owned implementation or persistence types") {
            @Override
            public boolean test(JavaClass javaClass) {
                String packageName = javaClass.getPackageName();
                boolean salesOwned = packageName.equals(SALES_MODULE_PACKAGE)
                        || packageName.startsWith(SALES_MODULE_PACKAGE + ".")
                        || (SALES_OWNED_FLAT_PACKAGES.contains(packageName)
                            && isSalesOwnedFlatType(javaClass));
                if (!salesOwned) {
                    return false;
                }
                return !isPublishedPortContract(javaClass);
            }
        };
    }

    /**
     * A published Sales port, or a type published <em>inside</em> one — the port's own
     * request/response contract, such as {@code AttachmentStorePort.AttachmentRef} or
     * {@code SalesOrderLookupPort.SalesOrderRef}.
     *
     * <p>Both are things a consuming module is meant to depend on, so both are exempt.
     * The check is keyed on the {@code Port} suffix of the type itself or of its
     * <em>outermost</em> type, which keeps the exemption narrow: an implementation class
     * can never slip through it, because neither
     * {@code sales.api.SalesOrderLookupAdapter} nor
     * {@code service.SalesAttachmentStoreAdapter} is a port or nested inside one.
     *
     * <p>The name is resolved textually on purpose: when a boundary test imports a probe
     * class, ArchUnit knows the referenced type's name but not necessarily its enclosing
     * class, and a name-based check works in both cases.
     */
    private static boolean isPublishedPortContract(JavaClass javaClass) {
        String name = javaClass.getName();
        int nested = name.indexOf('$');
        String outermost = nested < 0 ? name : name.substring(0, nested);
        return outermost.substring(outermost.lastIndexOf('.') + 1)
                .endsWith(SALES_PUBLISHED_PORT_SUFFIX);
    }

    /**
     * The rule's source scope: Production-owned business <em>services</em>, by package
     * rather than by class-name prefix. Package-private so
     * {@code ProductionSalesBoundaryTests} can prove the scope really contains the
     * services a prefix-based rule would miss.
     */
    static DescribedPredicate<JavaClass> productionOwnedServices() {
        return new DescribedPredicate<>("are Production-owned business services") {
            @Override
            public boolean test(JavaClass javaClass) {
                String packageName = javaClass.getPackageName();
                return packageName.equals(PRODUCTION_SERVICE_PACKAGE)
                        || packageName.startsWith(PRODUCTION_SERVICE_PACKAGE + ".");
            }
        };
    }

    /**
     * The flat-layer type names that are Sales-owned: the {@code Sales*} types plus the
     * sales document chain ({@link #SALES_DOCUMENT_CHAIN_PREFIXES}), which the predicate
     * alone used to miss. Kept as a method so the two name categories are legible in one
     * place and {@code ProductionSalesBoundaryTests} can assert both sides of the
     * classification.
     */
    private static boolean isSalesOwnedFlatType(JavaClass javaClass) {
        String simpleName = javaClass.getSimpleName();
        return simpleName.startsWith("Sales")
                || SALES_DOCUMENT_CHAIN_PREFIXES.stream().anyMatch(simpleName::startsWith);
    }

    /**
     * Everything Production owns: exactly the packaged namespaces in
     * {@link #PRODUCTION_PACKAGES}. §14.14 moved the last two flat workflows — the
     * tracker and quality inspection, with their entities, repositories, services and
     * controllers — into them, so ownership is expressed by package and never by a class
     * name any more. That is stricter than the name-prefix fallback it replaces: a future
     * {@code Production*}-looking class left in a flat package is now "outside", so the
     * rule below reports it the moment it touches a production table.
     *
     * <p>This is the mirror of {@link #salesOwnedInternals()} on the Production side and
     * exists so the rules that forbid <em>outside</em> code from touching production
     * internals can say "outside" precisely. It is a superset of
     * {@link #productionOwnedServices()} (which is only the services) and of
     * {@link #productionOwnedPersistence()} (which is only the persistence).
     */
    static DescribedPredicate<JavaClass> productionOwnedTypes() {
        return new DescribedPredicate<>("are Production-owned types") {
            @Override
            public boolean test(JavaClass javaClass) {
                String packageName = javaClass.getPackageName();
                if (!packageName.startsWith("com.vishatech.erp")) {
                    return false;
                }
                return PRODUCTION_PACKAGES.stream().anyMatch(pkg ->
                        packageName.equals(pkg) || packageName.startsWith(pkg + "."));
            }
        };
    }

    /**
     * Production-owned persistence: what no other module may read directly. Since §14.14
     * this is package-based — every persisted production type and every repository the
     * module owns lives in {@code entity.production} / {@code repository.production},
     * including the tracker and quality-inspection tables, whose names, columns and
     * mappings did not change with the move.
     *
     * <p>The CPR technical-verification entities are deliberately <em>not</em> here:
     * {@code CprTechnicalVerification}, its document entity and
     * {@code TechnicalVerificationStatus} belong to the CPR workflow (the status enum is
     * also the status of the production-side verification record), so they are another
     * module's persistence rather than production's, and forcing them into
     * {@code entity.production} would misattribute them and re-create the cross-module
     * dependency this suite exists to prevent.
     */
    static DescribedPredicate<JavaClass> productionOwnedPersistence() {
        return new DescribedPredicate<>("are Production-owned persistence types") {
            @Override
            public boolean test(JavaClass javaClass) {
                String packageName = javaClass.getPackageName();
                return packageName.startsWith("com.vishatech.erp.repository.production")
                        || packageName.startsWith("com.vishatech.erp.entity.production");
            }
        };
    }

    /**
     * The Production → Sales boundary rule: a production service may reach Sales only
     * through the published {@code sales.api} ports.
     *
     * <p>Parameterless on purpose. The rule shipped frozen for three measured offenders
     * (P4); P5/P6/P7 migrated all three onto {@code AttachmentStorePort} and
     * {@code SalesOrderLookupPort}, so the freeze was deleted and the rule is now
     * enforced. {@code ProductionSalesBoundaryTests} re-introduces each dependency with
     * its own probe class and requires the rule to report it, which is what keeps the
     * guard provably as strong as it was when the freeze existed.
     */
    static ArchRule productionServicesDoNotDependOnSalesInternals() {
        return noClasses()
                .that(productionOwnedServices())
                .should().dependOnClassesThat(salesOwnedInternals())
                .because("Production consumes Sales documents and must do so through a "
                        + "published Sales port, never by importing Sales entities, "
                        + "repositories, DTOs or service implementations; see P4 in "
                        + "MODULAR_MONOLITH_FOUNDATION.md");
    }

    /**
     * Enforced outbound boundary for Production — no allow-list, no freeze.
     *
     * <p>This is the direction the audit found completely unguarded. It is scoped to
     * {@code service.production..} plus the two flat production-owned services, so it
     * covers {@code ModelService}, {@code DrawingService}, {@code DispatchService} and
     * {@code PackingListService} — the names a prefix-based scope would have missed.
     */
    @ArchTest
    static final ArchRule production_services_do_not_depend_on_sales_internals =
            productionServicesDoNotDependOnSalesInternals();

    /**
     * Production cannot reach into any <em>other</em> business module's internals
     * either: CRM's entities and repositories, Purchase's internals, and the flat
     * CPR / Accounts / Marketing / Product types.
     *
     * <p><b>Why this rule exists.</b> The P4 audit closed the Production → Sales
     * direction because that was the coupling actually present in the code. Production
     * is the module every other workflow feeds into, though, so the same question has to
     * be asked of the other modules, and until this rule existed a production service
     * could have imported {@code crm.entity.Customer}, {@code MarketingVisitService} or a
     * CPR type without failing a single boundary test. The Sales direction keeps its own
     * dedicated rule above, which is more precise (packages, the {@code Sales*} name
     * category and the document chains) and documented separately; this rule covers
     * everything else, so the two together leave no hole.
     *
     * <p><b>Enforced, with no allow-list, because it is measured clean:</b> the
     * production module imports no CRM, CPR, Purchase, Marketing, Accounts or Product
     * implementation type at all — its non-production imports are shared platform code
     * (exceptions, {@code ApiResponse}, {@code util}, the neutral
     * {@code com.vishatech.erp.audit} contract), the shared dashboard contracts
     * ({@code dashboard.port}, {@code dashboard.dto}), the shared CAD engine, the shared
     * {@code AppSetting} store, and Sales through the published ports. Keep it that way:
     * if a real dependency is ever needed, the fix is a published port in the owning
     * module, not an allow-list entry here.
     */
    @ArchTest
    static final ArchRule production_does_not_depend_on_other_business_module_internals =
            productionDoesNotDependOnOtherBusinessModuleInternals();

    /**
     * Builds the "no other module's internals" rule. Not parameterised: it is enforced
     * with no freeze, so there is nothing for a scope test to remove.
     */
    static ArchRule productionDoesNotDependOnOtherBusinessModuleInternals() {
        return noClasses()
                .that(productionOwnedServices())
                .should().dependOnClassesThat(otherBusinessModuleInternals())
                .because("Production consumes other modules' workflows, so it must do "
                        + "so through a published port of the owning module rather than "
                        + "by importing its internals; Sales has its own rule above");
    }

    /**
     * Another business module's internals, from Production's point of view: CRM's
     * entities and repositories, everything Purchase keeps private, and the flat types
     * of CPR, Accounts, Marketing and the product master.
     *
     * <p>Sales is deliberately <em>not</em> part of this predicate — it has the dedicated,
     * more precise rule above — and neither are production's own workflows, shared
     * platform packages ({@code audit}, {@code util}, {@code dashboard}, {@code cad},
     * {@code security}, {@code exception}) or Sales-owned contracts. Package-private so
     * {@code ProductionBoundaryScopeTests} can assert that production's own types and
     * shared infrastructure are classified as "not another module's internals".
     */
    static DescribedPredicate<JavaClass> otherBusinessModuleInternals() {
        return new DescribedPredicate<>("are another business module's internals") {
            @Override
            public boolean test(JavaClass javaClass) {
                String packageName = javaClass.getPackageName();
                if (!packageName.startsWith("com.vishatech.erp")) {
                    return false;
                }
                // Production's own types are never "another module's internals" — least of all
                // for Production's own rule. This guard is what keeps the shared dashboard
                // contracts ({@code dashboard.port.ProductionDashboardPort}) and production's
                // own repositories out of the target set.
                if (productionOwnedTypes().test(javaClass)) {
                    return false;
                }
                if (packageName.startsWith("com.vishatech.erp.crm.entity")
                        || packageName.startsWith("com.vishatech.erp.crm.repository")) {
                    return true;
                }
                if (purchaseModuleInternals().test(javaClass)) {
                    return true;
                }
                String simpleName = javaClass.getSimpleName();
                // The Product master-data module is a business module; the Production module is
                // not a target of its own rule, so the "Product" prefix must not swallow
                // "Production*" (ProductionOrderRepository, ProductionDashboardPort, …).
                if (simpleName.startsWith("Production")) {
                    return false;
                }
                return OTHER_BUSINESS_MODULE_PREFIXES.stream().anyMatch(simpleName::startsWith);
            }
        };
    }

    /**
     * The flat business types that belong to another module and are not Sales-owned.
     * Sales' own chain is in {@link #SALES_CHAIN_PREFIXES}; production's workflows are in
     * {@link #BUSINESS_MODULE_PREFIXES} but must never be a target of its own rule.
     */
    private static final List<String> OTHER_BUSINESS_MODULE_PREFIXES = List.of(
            "Customer", "Contact", "Lead", "FollowUp",
            "Cpr", "PrReference",
            "CostWorkout", "ProfitWorkout", "ExchangeRate",
            "Marketing", "QuestionnaireForm", "QForm",
            "Product");

    /**
     * Marketing reads the CRM customer and the sales attachment table. Both are
     * real, currently-unresolved couplings; Phase 3 introduces a
     * {@code CustomerLookupPort} and a shared attachment port for them.
     */
    @ArchTest
    static final ArchRule marketing_does_not_depend_on_crm_or_sales =
            noClasses()
                    .that().haveSimpleNameStartingWith("Marketing")
                    .and(notIn("marketing -> CRM/sales", MARKETING_TO_CRM_SALES_ALLOWLIST))
                    .should().dependOnClassesThat(
                            startsWithAnyOf("belongs to CRM or Sales", CRM_AND_SALES_PREFIXES));

    // ---------------------------------------------------------- CRM module
    // The CRM module now lives in com.vishatech.erp.crm.{entity,repository,
    // service,controller,dto}. Entity and repository are its internals: other
    // modules talk to CRM through its services and DTOs only.

    /**
     * Enforced: nothing outside the CRM module may read a CRM entity or CRM
     * repository directly. The allow-list below holds the couplings that exist
     * today; removing an entry is always safe, adding one is an architectural
     * decision that has to be justified in CRM_MODULE_REFACTOR.md.
     */
    @ArchTest
    static final ArchRule outside_does_not_depend_on_crm_internals =
            noClasses()
                    .that().resideOutsideOfPackages("com.vishatech.erp.crm..")
                    .and(notIn("outside -> CRM internals", OUTSIDE_TO_CRM_INTERNALS_ALLOWLIST))
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "com.vishatech.erp.crm.entity..",
                            "com.vishatech.erp.crm.repository..");

    /** Enforced: CRM is self-contained with respect to these modules today. */
    @ArchTest
    static final ArchRule crm_does_not_depend_on_other_business_modules =
            noClasses()
                    .that().resideInAPackage("com.vishatech.erp.crm..")
                    .should().dependOnClassesThat(startsWithAnyOf(
                            "belongs to a module CRM does not use", CRM_MUST_NOT_TOUCH));

    /**
     * Frozen: the customer statement renders invoices and payment receipts, so
     * CRM currently depends on the sales document chain. The target state is a
     * statement read port owned by the accounts side.
     */
    @ArchTest
    static final ArchRule crm_does_not_depend_on_the_sales_document_chain =
            noClasses()
                    .that().resideInAPackage("com.vishatech.erp.crm..")
                    .and(notIn("CRM -> sales document chain", CRM_TO_SALES_CHAIN_ALLOWLIST))
                    .should().dependOnClassesThat(
                            startsWithAnyOf("belongs to the sales document chain", SALES_CHAIN_PREFIXES));
}
