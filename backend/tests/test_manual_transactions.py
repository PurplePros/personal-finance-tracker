"""HTTP-seam tests for manual institution and manual transaction endpoints."""

import datetime


# --- Helpers ---

def _create_institution(client, name="BMO", holder="Jade"):
    resp = client.post("/api/institutions/manual", json={"name": name, "holder": holder})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_transaction(client, institution_id, **kwargs):
    payload = {
        "institution_id": institution_id,
        "name": kwargs.get("name", "Groceries"),
        "amount_cents": kwargs.get("amount_cents", 5000),
        "date": kwargs.get("date", "2026-09-01"),
        "category": kwargs.get("category", {"major": "Food and personal items", "subcategory": "Groceries and personal items"}),
        "note": kwargs.get("note"),
    }
    resp = client.post("/api/transactions/manual", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- Manual institution tests ---

def test_create_manual_institution(client):
    inst = _create_institution(client, name="BMO", holder="Jade")
    assert inst["name"] == "BMO"
    assert inst["holder"] == "Jade"
    assert inst["is_manual"] is True
    assert "id" in inst


def test_manual_institution_appears_in_institutions_list(client):
    _create_institution(client, name="BMO", holder="Jade")
    institutions = client.get("/api/institutions").json()
    manual = [i for i in institutions if i["name"] == "BMO"]
    assert len(manual) == 1
    assert manual[0]["is_manual"] is True


def test_create_manual_institution_missing_name_returns_422(client):
    resp = client.post("/api/institutions/manual", json={"holder": "Jade"})
    assert resp.status_code == 422


def test_create_manual_institution_missing_holder_returns_422(client):
    resp = client.post("/api/institutions/manual", json={"name": "BMO"})
    assert resp.status_code == 422


def test_delete_manual_institution_with_no_transactions(client):
    inst = _create_institution(client)
    resp = client.delete(f"/api/institutions/manual/{inst['id']}")
    assert resp.status_code == 204
    institutions = client.get("/api/institutions").json()
    assert not any(i["id"] == inst["id"] for i in institutions)


def test_delete_manual_institution_with_transactions_returns_409(client):
    inst = _create_institution(client)
    _create_transaction(client, inst["id"])
    resp = client.delete(f"/api/institutions/manual/{inst['id']}")
    assert resp.status_code == 409


def test_delete_nonexistent_manual_institution_returns_404(client):
    import uuid
    resp = client.delete(f"/api/institutions/manual/{uuid.uuid4()}")
    assert resp.status_code == 404


# --- Manual transaction creation ---

def test_create_manual_transaction_appears_in_list(client):
    inst = _create_institution(client, holder="Jade")
    txn = _create_transaction(client, inst["id"], amount_cents=7500, date="2026-09-05")
    assert txn["amount"] == 7500
    assert txn["date"] == "2026-09-05"
    assert txn["is_manual"] is True
    assert txn["category"] == {"major": "Food and personal items", "subcategory": "Groceries and personal items"}
    assert txn["category_source"] == "user"
    assert txn["is_spending"] is True
    assert txn["pending"] is False

    listed = client.get("/api/transactions").json()
    ids = [t["id"] for t in listed]
    assert txn["id"] in ids


def test_manual_transaction_with_note(client):
    inst = _create_institution(client)
    txn = _create_transaction(client, inst["id"], note="Split with roommate")
    assert txn["note"] == "Split with roommate"


def test_create_manual_transaction_invalid_category_returns_422(client):
    inst = _create_institution(client)
    resp = client.post("/api/transactions/manual", json={
        "institution_id": inst["id"],
        "name": "Test",
        "amount_cents": 1000,
        "date": "2026-09-01",
        "category": {"major": "Fake", "subcategory": "Also fake"},
    })
    assert resp.status_code == 422


def test_create_manual_transaction_missing_category_returns_422(client):
    inst = _create_institution(client)
    resp = client.post("/api/transactions/manual", json={
        "institution_id": inst["id"],
        "name": "Test",
        "amount_cents": 1000,
        "date": "2026-09-01",
    })
    assert resp.status_code == 422


def test_create_manual_transaction_unknown_institution_returns_404(client):
    import uuid
    resp = client.post("/api/transactions/manual", json={
        "institution_id": str(uuid.uuid4()),
        "name": "Test",
        "amount_cents": 1000,
        "date": "2026-09-01",
        "category": {"major": "Food and personal items", "subcategory": "Groceries and personal items"},
    })
    assert resp.status_code == 404


# --- Manual transaction update ---

def test_update_manual_transaction(client):
    inst = _create_institution(client)
    txn = _create_transaction(client, inst["id"], amount_cents=5000, name="Old name")

    resp = client.put(f"/api/transactions/manual/{txn['id']}", json={
        "name": "New name",
        "amount_cents": 9900,
        "date": "2026-09-10",
        "category": {"major": "Shopping", "subcategory": "Clothing"},
        "note": "Updated",
    })
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["name"] == "New name"
    assert updated["amount"] == 9900
    assert updated["date"] == "2026-09-10"
    assert updated["category"] == {"major": "Shopping", "subcategory": "Clothing"}
    assert updated["note"] == "Updated"


def test_update_nonexistent_manual_transaction_returns_404(client):
    import uuid
    resp = client.put(f"/api/transactions/manual/{uuid.uuid4()}", json={
        "name": "X",
        "amount_cents": 100,
        "date": "2026-09-01",
        "category": {"major": "Shopping", "subcategory": "Clothing"},
    })
    assert resp.status_code == 404


def test_update_plaid_transaction_via_manual_endpoint_returns_409(
    client, fake_plaid, seed_institution
):
    """PUT /api/transactions/manual/{id} must reject Plaid transactions."""
    from helpers import plaid_account, plaid_transaction

    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts("tok-1", [
        plaid_account("cc-1", "Visa", "credit", "credit card", 100.0, "CAD")
    ])
    fake_plaid.set_transactions("tok-1", added=[
        plaid_transaction("txn-1", "cc-1", 20.0, name="Coffee")
    ])
    client.post("/api/sync")
    txn_id = client.get("/api/transactions").json()[0]["id"]

    resp = client.put(f"/api/transactions/manual/{txn_id}", json={
        "name": "Hacked",
        "amount_cents": 1,
        "date": "2026-01-01",
        "category": {"major": "Shopping", "subcategory": "Clothing"},
    })
    assert resp.status_code == 409


# --- Manual transaction delete ---

def test_delete_manual_transaction(client):
    inst = _create_institution(client)
    txn = _create_transaction(client, inst["id"])

    resp = client.delete(f"/api/transactions/manual/{txn['id']}")
    assert resp.status_code == 204

    listed = client.get("/api/transactions").json()
    assert not any(t["id"] == txn["id"] for t in listed)


def test_delete_nonexistent_manual_transaction_returns_404(client):
    import uuid
    resp = client.delete(f"/api/transactions/manual/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_delete_plaid_transaction_via_manual_endpoint_returns_409(
    client, fake_plaid, seed_institution
):
    """DELETE /api/transactions/manual/{id} must reject Plaid transactions."""
    from helpers import plaid_account, plaid_transaction

    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts("tok-1", [
        plaid_account("cc-1", "Visa", "credit", "credit card", 100.0, "CAD")
    ])
    fake_plaid.set_transactions("tok-1", added=[
        plaid_transaction("txn-1", "cc-1", 20.0)
    ])
    client.post("/api/sync")
    txn_id = client.get("/api/transactions").json()[0]["id"]

    resp = client.delete(f"/api/transactions/manual/{txn_id}")
    assert resp.status_code == 409


# --- Integration: manual transactions participate in the transaction list ---

def test_manual_and_plaid_transactions_appear_together(
    client, fake_plaid, seed_institution
):
    """Manual transactions are returned alongside Plaid ones."""
    from helpers import plaid_account, plaid_transaction

    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts("tok-1", [
        plaid_account("cc-1", "Visa", "credit", "credit card", 100.0, "CAD")
    ])
    fake_plaid.set_transactions("tok-1", added=[
        plaid_transaction("txn-1", "cc-1", 30.0, date=datetime.date(2026, 9, 1))
    ])
    client.post("/api/sync")

    inst = _create_institution(client, holder="Jade")
    _create_transaction(client, inst["id"], amount_cents=5000, date="2026-09-02")

    transactions = client.get("/api/transactions").json()
    assert len(transactions) == 2
    amounts = {t["amount"] for t in transactions}
    assert amounts == {3000, 5000}

    manual = next(t for t in transactions if t["is_manual"])
    plaid_t = next(t for t in transactions if not t["is_manual"])
    assert manual["amount"] == 5000
    assert plaid_t["amount"] == 3000


def test_plaid_transactions_have_is_manual_false(client, fake_plaid, seed_institution):
    from helpers import plaid_account, plaid_transaction

    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts("tok-1", [
        plaid_account("cc-1", "Visa", "credit", "credit card", 100.0, "CAD")
    ])
    fake_plaid.set_transactions("tok-1", added=[plaid_transaction("txn-1", "cc-1", 10.0)])
    client.post("/api/sync")

    txn = client.get("/api/transactions").json()[0]
    assert txn["is_manual"] is False


def test_sync_skips_manual_institutions(client, fake_plaid):
    """Sync does not call Plaid for Manual institutions; they are silently skipped."""
    _create_institution(client, name="BMO", holder="Jade")
    resp = client.post("/api/sync")
    assert resp.status_code == 200
    # No Plaid calls were made (fake_plaid would error if called with None token)
    assert fake_plaid.fetch_cursors == []
