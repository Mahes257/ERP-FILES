#!/usr/bin/env python3
"""Fix promotePreviousRevision in all 10 document services.

The previous implementation only looked at rows returned by
findByRevisionOfOrderByRevisionDesc(baseId) — which never includes the base
row itself (revision 0, revision_of = NULL). So when the latest revision was
deleted and only the original remained, nothing was promoted to latest.

New logic: promote the highest remaining revision row; if none exists,
promote the base row (revision 0) if it is not the deleted row.
"""
import pathlib, re

SVC = pathlib.Path("erp-react/erp-backend/src/main/java/com/vishatech/erp/service")

MODULES = {
    "Cpr": ("cpr", "Cpr"),
    "CostWorkout": ("costWorkout", "CostWorkout"),
    "Quotation": ("quotation", "Quotation"),
    "SalesContract": ("salesContract", "SalesContract"),
    "SalesOrder": ("salesOrder", "SalesOrder"),
    "ProformaInvoice": ("proformaInvoice", "ProformaInvoice"),
    "DeliveryChallan": ("deliveryChallan", "DeliveryChallan"),
    "Invoice": ("invoice", "Invoice"),
    "CreditNote": ("creditNote", "CreditNote"),
    "PaymentReceipt": ("paymentReceipt", "PaymentReceipt"),
}

for svc_name, (repo, ent) in MODULES.items():
    p = SVC / f"{svc_name}Service.java"
    src = p.read_text(encoding="utf-8")

    old = re.compile(
        r"    private void promotePreviousRevision\(%s removed\) \{\n"
        r"        if \(!removed\.isLatestRevision\(\)\) \{\n"
        r"            return;\n"
        r"        \}\n"
        r"        Long baseId = removed\.getRevisionOf\(\) != null \? removed\.getRevisionOf\(\) : removed\.getId\(\);\n"
        r"        %sRepository\.findByRevisionOfOrderByRevisionDesc\(baseId\)\.stream\(\)\n"
        r"                \.filter\(q -> !q\.getId\(\)\.equals\(removed\.getId\(\)\)\)\n"
        r"                \.filter\(q -> !\"deleted\"\.equals\(q\.getStatus\(\)\)\)\n"
        r"                \.findFirst\(\)\n"
        r"                \.ifPresent\(q -> \{\n"
        r"                    q\.setLatestRevision\(true\);\n"
        r"                    %sRepository\.save\(q\);\n"
        r"                \}\);\n"
        r"    \}\n"
        % (ent, repo, repo),
    )

    new = (
        "    private void promotePreviousRevision(%s removed) {\n"
        "        if (!removed.isLatestRevision()) {\n"
        "            return;\n"
        "        }\n"
        "        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();\n"
        "        // Highest remaining revision row first (revision >= 1).\n"
        "        %sRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()\n"
        "                .filter(q -> !q.getId().equals(removed.getId()))\n"
        "                .filter(q -> !\"deleted\".equals(q.getStatus()))\n"
        "                .findFirst()\n"
        "                .ifPresentOrElse(q -> {\n"
        "                    q.setLatestRevision(true);\n"
        "                    %sRepository.save(q);\n"
        "                }, () -> %sRepository.findById(baseId).ifPresent(q -> {\n"
        "                    // Fall back to the base row (revision 0) when no revision rows remain.\n"
        "                    if (!q.getId().equals(removed.getId()) && !\"deleted\".equals(q.getStatus())) {\n"
        "                        q.setLatestRevision(true);\n"
        "                        %sRepository.save(q);\n"
        "                    }\n"
        "                }));\n"
        "    }\n"
        % (ent, repo, repo, repo, repo)
    )

    if old.search(src):
        src = old.sub(new, src)
        p.write_text(src, encoding="utf-8")
        print(f"[ok] {svc_name}: promotePreviousRevision fixed")
    else:
        print(f"[WARN] {svc_name}: pattern not found")

print("ALL_DONE")
