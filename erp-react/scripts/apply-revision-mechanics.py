#!/usr/bin/env python3
"""Apply the mechanical revision additions to the 9 non-Quotation document modules.

Adds:
- entity: revisionOf/revision/revisionDate/latestRevision fields + getters/setters
- repository: findByRevisionOfOrderByRevisionDesc
- response DTO: revision/revisionOf/latestRevision/revisionDate/revisions fields
"""
import os
import re

ROOT = os.path.join("erp-react", "erp-backend", "src", "main", "java", "com", "vishatech", "erp")

MODULES = [
    ("Cpr", "cpr"),
    ("CostWorkout", "costWorkout"),
    ("SalesContract", "salesContract"),
    ("SalesOrder", "salesOrder"),
    ("ProformaInvoice", "proformaInvoice"),
    ("DeliveryChallan", "deliveryChallan"),
    ("Invoice", "invoice"),
    ("CreditNote", "creditNote"),
    ("PaymentReceipt", "paymentReceipt"),
]

FIELD_BLOCK = """
    // ---- Revision chain (every edit creates a new revision row; the
    // previous version is NEVER deleted or overwritten) ----

    /** Id of the chain root (the original document). Null for the original. */
    private Long revisionOf;

    /** 0 = original, 1, 2, 3 ... per edit. */
    @Column(nullable = false)
    private int revision;

    /** When this revision was created. */
    private LocalDateTime revisionDate;

    /** Only the newest revision is editable/current. */
    @Column(nullable = false)
    private boolean latestRevision = true;
"""

GETTERS_BLOCK = """
    public Long getRevisionOf() {
        return revisionOf;
    }

    public void setRevisionOf(Long revisionOf) {
        this.revisionOf = revisionOf;
    }

    public int getRevision() {
        return revision;
    }

    public void setRevision(int revision) {
        this.revision = revision;
    }

    public LocalDateTime getRevisionDate() {
        return revisionDate;
    }

    public void setRevisionDate(LocalDateTime revisionDate) {
        this.revisionDate = revisionDate;
    }

    public boolean isLatestRevision() {
        return latestRevision;
    }

    public void setLatestRevision(boolean latestRevision) {
        this.latestRevision = latestRevision;
    }
"""

DTO_FIELDS = """        Integer revision,
        Long revisionOf,
        Boolean latestRevision,
        String revisionDate,
        List<RevisionInfo> revisions
"""

errors = []


def entity_path(cls):
    return os.path.join(ROOT, "entity", cls + ".java")


def repo_path(cls):
    return os.path.join(ROOT, "repository", cls + "Repository.java")


def dto_path(cls):
    return os.path.join(ROOT, "dto", cls + "Response.java")


def apply(cls):
    ep = entity_path(cls)
    with open(ep, "r", encoding="utf-8") as f:
        src = f.read()

    if "getRevisionOf" in src:
        print(f"[skip-entity] {cls} already has revision fields")
    else:
        # 1) fields after archivedAt field declaration
        m = re.search(r"(    private LocalDateTime archivedAt;\n)", src)
        if not m:
            errors.append(f"{cls}: no archivedAt field")
            return
        src = src.replace(m.group(1), m.group(1) + FIELD_BLOCK, 1)
        # 2) getters/setters before final closing brace
        idx = src.rstrip().rfind("}")
        if idx == -1:
            errors.append(f"{cls}: no closing brace")
            return
        src = src[:idx] + GETTERS_BLOCK + src[idx:]
        with open(ep, "w", encoding="utf-8") as f:
            f.write(src)
        print(f"[ok-entity] {cls}")

    rp = repo_path(cls)
    with open(rp, "r", encoding="utf-8") as f:
        rsrc = f.read()
    if "findByRevisionOfOrderByRevisionDesc" in rsrc:
        print(f"[skip-repo] {cls}")
    else:
        rsrc = rsrc.rstrip()
        rsrc = rsrc[:-1] if rsrc.endswith("}") else rsrc
        rsrc = rsrc.rstrip() + "\n\n    List<" + cls + "> findByRevisionOfOrderByRevisionDesc(Long revisionOf);\n}\n"
        with open(rp, "w", encoding="utf-8") as f:
            f.write(rsrc)
        print(f"[ok-repo] {cls}")

    dp = dto_path(cls)
    with open(dp, "r", encoding="utf-8") as f:
        dsrc = f.read()
    if "RevisionInfo" in dsrc:
        print(f"[skip-dto] {cls}")
        return
    # Insert revision fields right before the final ")" that closes the record
    # parameter list: find the LAST "\n)" before the body "{\n}".
    close_idx = dsrc.rfind(")")
    body_idx = dsrc.rfind("{\n}")
    if close_idx == -1 or body_idx == -1 or close_idx > body_idx:
        errors.append(f"{cls}: cannot locate record close paren")
        return
    dsrc = dsrc[:close_idx] + ",\n" + DTO_FIELDS + dsrc[close_idx:]
    with open(dp, "w", encoding="utf-8") as f:
        f.write(dsrc)
    print(f"[ok-dto] {cls}")


for cls, _ in MODULES:
    apply(cls)

if errors:
    print("\nERRORS:")
    for e in errors:
        print(" -", e)
else:
    print("\nALL_DONE")
