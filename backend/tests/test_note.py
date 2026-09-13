"""HTTP-seam tests for the transaction note field."""

from helpers import plaid_account, plaid_transaction


def _seed_cc_with_txn(fake_plaid, seed_institution):
    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts(
        "tok-1",
        [
            plaid_account(
                account_id="cc-1",
                name="Visa",
                plaid_type="credit",
                subtype="credit card",
                current=100.0,
                iso_currency_code="CAD",
            )
        ],
    )
    fake_plaid.set_transactions(
        "tok-1",
        added=[plaid_transaction("txn-1", "cc-1", 50.0, name="INTERAC E-TFR")],
    )


def test_note_field_present_on_get_transactions(client, fake_plaid, seed_institution):
    """note field is present (null by default) on GET /api/transactions."""
    _seed_cc_with_txn(fake_plaid, seed_institution)
    client.post("/api/sync")

    txn = client.get("/api/transactions").json()[0]
    assert "note" in txn
    assert txn["note"] is None


def test_patch_sets_note_and_returns_it(client, fake_plaid, seed_institution):
    """PATCH with note sets it; the note is returned in the response."""
    _seed_cc_with_txn(fake_plaid, seed_institution)
    client.post("/api/sync")
    txn_id = client.get("/api/transactions").json()[0]["id"]

    response = client.patch(
        f"/api/transactions/{txn_id}", json={"note": "e-transfer to landlord"}
    )
    assert response.status_code == 200
    assert response.json()["note"] == "e-transfer to landlord"


def test_patch_null_note_clears_it(client, fake_plaid, seed_institution):
    """PATCH with note=null clears a previously set note."""
    _seed_cc_with_txn(fake_plaid, seed_institution)
    client.post("/api/sync")
    txn_id = client.get("/api/transactions").json()[0]["id"]

    client.patch(f"/api/transactions/{txn_id}", json={"note": "original note"})
    response = client.patch(f"/api/transactions/{txn_id}", json={"note": None})
    assert response.status_code == 200
    assert response.json()["note"] is None


def test_note_persists_across_sync(client, fake_plaid, seed_institution):
    """A note survives a subsequent Sync that modifies the transaction."""
    _seed_cc_with_txn(fake_plaid, seed_institution)
    client.post("/api/sync")
    txn_id = client.get("/api/transactions").json()[0]["id"]

    client.patch(f"/api/transactions/{txn_id}", json={"note": "rent e-transfer"})

    fake_plaid.set_transactions(
        "tok-1",
        modified=[plaid_transaction("txn-1", "cc-1", 50.0, name="INTERAC E-TFR updated")],
    )
    client.post("/api/sync")

    txn = client.get("/api/transactions").json()[0]
    assert txn["note"] == "rent e-transfer"


def test_patch_note_does_not_disturb_category(client, fake_plaid, seed_institution):
    """Patching note alone leaves the category override untouched."""
    _seed_cc_with_txn(fake_plaid, seed_institution)
    client.post("/api/sync")
    txn_id = client.get("/api/transactions").json()[0]["id"]

    client.patch(
        f"/api/transactions/{txn_id}",
        json={"category": {"major": "Housing", "subcategory": "Mortgage"}},
    )
    client.patch(f"/api/transactions/{txn_id}", json={"note": "my note"})

    txn = client.get("/api/transactions").json()[0]
    assert txn["category"] == {"major": "Housing", "subcategory": "Mortgage"}
    assert txn["note"] == "my note"
