#!/usr/bin/env python3
"""Fix the 9 document services: add RevisionInfo import + single-arg toResponse overload."""
import re, pathlib

SVC = pathlib.Path("erp-react/erp-backend/src/main/java/com/vishatech/erp/service")
MODULES = {
    "Cpr": "Cpr",
    "CostWorkout": "CostWorkout",
    "SalesContract": "SalesContract",
    "SalesOrder": "SalesOrder",
    "ProformaInvoice": "ProformaInvoice",
    "DeliveryChallan": "DeliveryChallan",
    "Invoice": "Invoice",
    "CreditNote": "CreditNote",
    "PaymentReceipt": "PaymentReceipt",
}

for svc_name, ent in MODULES.items():
    p = SVC / f"{svc_name}Service.java"
    src = p.read_text(encoding="utf-8")

    changed = []

    # 1. Add RevisionInfo import after the last com.vishatech.erp.dto import
    if "import com.vishatech.erp.dto.RevisionInfo;" not in src:
        m = list(re.finditer(r"^import com\.vishatech\.erp\.dto\.[A-Za-z0-9_.]+;\s*$", src, re.M))
        if m:
            last = m[-1]
            # Insert after the last dto import (in original order)
            idx = last.end()
            # find the end of that line (incl newline)
            eol = src.find("\n", idx)
            if eol == -1:
                eol = idx
            src = src[:eol] + "\nimport com.vishatech.erp.dto.RevisionInfo;" + src[eol:]
            changed.append("import")

    # 2. Add single-arg toResponse overload right before the two-arg toResponse(entity, List<RevisionInfo>)
    pat = re.compile(
        r"(    private %sResponse toResponse\(%s [a-zA-Z]+, (?:java\.util\.)?List<RevisionInfo> revisions\) \{\n)"
        % (svc_name, ent)
    )
    m = pat.search(src)
    if m:
        overload = (
            "    /** List/export response - carries no revision chain (avoids N+1). */\n"
            "    private %sResponse toResponse(%s entity) {\n"
            "        return toResponse(entity, List.of());\n"
            "    }\n\n"
            "%s"
        ) % (svc_name, ent, m.group(1))
        src = src[:m.start()] + overload + src[m.end():]
        changed.append("overload")
    else:
        print(f"[WARN] {svc_name}: two-arg toResponse signature not found")

    p.write_text(src, encoding="utf-8")
    print(f"[ok] {svc_name}: {', '.join(changed) if changed else 'no changes'}")

print("ALL_DONE")
