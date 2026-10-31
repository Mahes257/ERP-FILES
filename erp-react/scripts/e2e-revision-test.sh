#!/bin/bash
# E2E: every edit creates a revision (Quotation) + delete stays separate.
#
# WARNING: this is a manual one-off driver, not part of the test suite or CI.
# It writes real rows (user, quotations) to the database it points at, so run it
# only against a disposable development database, never against production.
#
# No machine paths or credentials are hardcoded: reuse the backend settings by
# exporting them first, e.g. from Git Bash inside erp-backend/:
#   set -a; . ./.env; set +a
#   ERP_DB_USERNAME="$ERP_DATABASE_USERNAME" ERP_DB_PASSWORD="$ERP_DATABASE_PASSWORD" \
#     ../scripts/e2e-revision-test.sh
BASE=${ERP_BASE_URL:-http://localhost:8080}/v1
# `mysql` from PATH by default; override with ERP_MYSQL if it is not on PATH.
MYSQL=${ERP_MYSQL:-mysql}
DB=${ERP_DB_NAME:-erp_db}
DB_USER=${ERP_DB_USERNAME:?set ERP_DB_USERNAME to the MySQL user that owns the ERP database}
DB_PASS=${ERP_DB_PASSWORD:?set ERP_DB_PASSWORD to that MySQL user password}
EMAIL="rev_audit_$(date +%s)@vishatech.in"
PASS="Test@12345"
STAMP=$(date +%s)

echo "=== 1. REGISTER ==="
REG=$(curl -s -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d "{\"fullName\":\"Rev Audit\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"role\":\"ADMIN\"}")
TOKEN=$(echo "$REG" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then echo "REGISTER FAILED: $REG"; exit 1; fi
echo "token ok: ${TOKEN:0:20}..."

AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"

echo "=== 2. CREATE QUOTATION (draft) ==="
CREATE=$(curl -s -X POST $BASE/quotations -H "$AUTH" -H "$CT" \
  -d "{\"quotationDate\":\"2026-08-11\",\"validUntil\":\"2026-09-11\",\"clientName\":\"E2E Rev Client $STAMP\",\"contactPerson\":\"Test\",\"email\":\"test@rev.in\",\"phone\":\"9999999999\",\"address\":\"Test Address\",\"city\":\"Mumbai\",\"state\":\"MH\",\"status\":\"draft\",\"items\":[{\"description\":\"Widget\",\"quantity\":2,\"unitPrice\":500,\"gstPct\":18}]}")
echo "$CREATE" | head -c 400; echo
QID=$(echo "$CREATE" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
QNO=$(echo "$CREATE" | sed -n 's/.*"quotationNo":"\([^"]*\)".*/\1/p' | head -1)
echo "created id=$QID no=$QNO"
if [ -z "$QID" ]; then echo "CREATE FAILED"; exit 1; fi

echo "=== 3. EDIT #1 (expect revision 1) ==="
R1=$(curl -s -X PUT $BASE/quotations/$QID -H "$AUTH" -H "$CT" \
  -d "{\"quotationDate\":\"2026-08-11\",\"validUntil\":\"2026-10-11\",\"clientName\":\"E2E Rev Client $STAMP\",\"contactPerson\":\"Test\",\"email\":\"test@rev.in\",\"phone\":\"9999999999\",\"address\":\"Test Address\",\"city\":\"Mumbai\",\"state\":\"MH\",\"status\":\"draft\",\"salesPerson\":\"Audit\",\"items\":[{\"description\":\"Widget\",\"quantity\":3,\"unitPrice\":500,\"gstPct\":18}]}")
R1ID=$(echo "$R1" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
R1NO=$(echo "$R1" | sed -n 's/.*"quotationNo":"\([^"]*\)".*/\1/p' | head -1)
R1REV=$(echo "$R1" | sed -n 's/.*"revision":\([0-9]*\).*/\1/p' | head -1)
echo "edit1 -> id=$R1ID no=$R1NO revision=$R1REV"
[ "$R1REV" = "1" ] && echo "PASS: revision 1 created" || echo "FAIL: expected revision 1, got '$R1REV'"

echo "=== 4. EDIT #2 (expect revision 2) ==="
R2=$(curl -s -X PUT $BASE/quotations/$R1ID -H "$AUTH" -H "$CT" \
  -d "{\"quotationDate\":\"2026-08-11\",\"validUntil\":\"2026-11-11\",\"clientName\":\"E2E Rev Client $STAMP\",\"contactPerson\":\"Test\",\"email\":\"test@rev.in\",\"phone\":\"9999999999\",\"address\":\"Test Address\",\"city\":\"Mumbai\",\"state\":\"MH\",\"status\":\"draft\",\"salesPerson\":\"Audit\",\"items\":[{\"description\":\"Widget\",\"quantity\":5,\"unitPrice\":500,\"gstPct\":18}]}")
R2ID=$(echo "$R2" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
R2NO=$(echo "$R2" | sed -n 's/.*"quotationNo":"\([^"]*\)".*/\1/p' | head -1)
R2REV=$(echo "$R2" | sed -n 's/.*"revision":\([0-9]*\).*/\1/p' | head -1)
echo "edit2 -> id=$R2ID no=$R2NO revision=$R2REV"
[ "$R2REV" = "2" ] && echo "PASS: revision 2 created" || echo "FAIL: expected revision 2, got '$R2REV'"

echo "=== 5. MYSQL VERIFY (3 rows: original + 2 revisions) ==="
"$MYSQL" -u$DB_USER -p$DB_PASS $DB -N -e \
  "SELECT id, quotation_no, revision, is_latest_revision FROM quotation WHERE revision_of = $QID OR id = $QID ORDER BY revision;" 2>/dev/null | tee /tmp/rev_rows.txt
ROWS=$(wc -l < /tmp/rev_rows.txt)
echo "row count: $ROWS"
[ "$ROWS" = "3" ] && echo "PASS: 3 rows preserved" || echo "FAIL: expected 3 rows, got $ROWS"

echo "=== 6. LATEST FLAG ==="
LATEST=$(grep -c '1$' /tmp/rev_rows.txt | head -1)
echo "latest-marked rows: $LATEST"

echo "=== 7. GET DETAIL shows revision chain ==="
DETAIL=$(curl -s $BASE/quotations/$R2ID -H "$AUTH")
CHAIN=$(echo "$DETAIL" | grep -o '"revisions"' | head -1)
[ -n "$CHAIN" ] && echo "PASS: detail carries revisions chain" || echo "FAIL: no revisions chain in detail"

echo "=== 8. DELETE the original (separate operation) ==="
DEL=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/quotations/$QID -H "$AUTH")
echo "delete original -> HTTP $DEL"
[ "$DEL" = "200" ] || [ "$DEL" = "204" ] && echo "PASS: delete works" || echo "FAIL: delete returned $DEL"

echo "=== 9. ORIGINAL STILL EXISTS (soft delete keeps row) ==="
DELROW=$("$MYSQL" -u$DB_USER -p$DB_PASS $DB -N -e "SELECT COUNT(*) FROM quotation WHERE id = $QID;" 2>/dev/null)
echo "original rows after delete: $DELROW"

echo "=== 10. EDIT DOES NOT DELETE (revisions remain) ==="
KEEP=$("$MYSQL" -u$DB_USER -p$DB_PASS $DB -N -e \
  "SELECT COUNT(*) FROM quotation WHERE revision_of = $QID OR id = $QID;" 2>/dev/null)
echo "chain rows after delete: $KEEP"
echo "=== E2E DONE ==="
