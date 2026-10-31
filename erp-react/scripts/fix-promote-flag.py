#!/usr/bin/env python3
"""Clear latestRevision on the removed row when a successor is promoted.

Keeps exactly one non-deleted row flagged as latest across the chain.
"""
import pathlib, re

SVC = pathlib.Path("erp-react/erp-backend/src/main/java/com/vishatech/erp/service")

MODULES = {
    "Cpr": "cpr",
    "CostWorkout": "costWorkout",
    "Quotation": "quotation",
    "SalesContract": "salesContract",
    "SalesOrder": "salesOrder",
    "ProformaInvoice": "proformaInvoice",
    "DeliveryChallan": "deliveryChallan",
    "Invoice": "invoice",
    "CreditNote": "creditNote",
    "PaymentReceipt": "paymentReceipt",
}

for svc_name, repo in MODULES.items():
    p = SVC / f"{svc_name}Service.java"
    src = p.read_text(encoding="utf-8")

    old = (
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
        % (repo, repo, repo)
    )
    new = (
        "                .ifPresentOrElse(q -> {\n"
        "                    q.setLatestRevision(true);\n"
        "                    %sRepository.save(q);\n"
        "                    removed.setLatestRevision(false);\n"
        "                    %sRepository.save(removed);\n"
        "                }, () -> %sRepository.findById(baseId).ifPresent(q -> {\n"
        "                    // Fall back to the base row (revision 0) when no revision rows remain.\n"
        "                    if (!q.getId().equals(removed.getId()) && !\"deleted\".equals(q.getStatus())) {\n"
        "                        q.setLatestRevision(true);\n"
        "                        %sRepository.save(q);\n"
        "                        removed.setLatestRevision(false);\n"
        "                        %sRepository.save(removed);\n"
        "                    }\n"
        "                }));\n"
        % (repo, repo, repo, repo, repo)
    )

    if old in src:
        src = src.replace(old, new)
        p.write_text(src, encoding="utf-8")
        print(f"[ok] {svc_name}")
    else:
        print(f"[WARN] {svc_name}: pattern not found")

print("ALL_DONE")
