"""Tests for POST /api/plaid/link-token and POST /api/plaid/exchange-token."""

import plaid


def test_link_token_no_item_id(client, fake_plaid):
    """No item_id → link token created for a first-time connection."""
    fake_plaid.set_link_token("link-sandbox-abc")
    response = client.post("/api/plaid/link-token", json={})
    assert response.status_code == 200
    assert response.json() == {"link_token": "link-sandbox-abc"}


def test_link_token_update_mode(client, fake_plaid, seed_institution):
    """item_id present → link token created in update mode (institution found)."""
    fake_plaid.set_link_token("link-sandbox-update")
    seed_institution(access_token="tok-reconnect", plaid_item_id="item-xyz")

    response = client.post("/api/plaid/link-token", json={"item_id": "item-xyz"})
    assert response.status_code == 200
    assert response.json() == {"link_token": "link-sandbox-update"}


def test_link_token_update_mode_unknown_item(client, fake_plaid):
    """item_id with no matching institution returns 404."""
    response = client.post("/api/plaid/link-token", json={"item_id": "item-missing"})
    assert response.status_code == 404


def test_exchange_token_creates_institution(client, fake_plaid):
    """exchange-token saves a new institution and returns its id."""
    fake_plaid.set_exchange_result("access-new", "item-new")

    response = client.post(
        "/api/plaid/exchange-token",
        json={"public_token": "public-sandbox-token", "institution_name": "TD Bank"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "institution_id" in body

    institutions = client.get("/api/institutions").json()
    assert any(i["name"] == "TD Bank" for i in institutions)


def test_sync_error_includes_institution_id_and_error_code(
    client, fake_plaid, seed_institution
):
    """Sync error dict includes institution_id and error_code for broken tokens."""
    institution = seed_institution(access_token="tok-broken")
    error_body = '{"error_code": "ITEM_LOGIN_REQUIRED", "error_type": "ITEM_ERROR"}'
    fake_plaid.set_error(
        "tok-broken",
        plaid.ApiException(status=400, reason="Bad Request", http_resp=None),  # type: ignore[arg-type]
    )
    # Manually set body on the exception since the constructor doesn't accept it
    exc = plaid.ApiException(status=400, reason="Bad Request", http_resp=None)  # type: ignore[arg-type]
    exc.body = error_body
    fake_plaid.set_error("tok-broken", exc)

    response = client.post("/api/sync")
    assert response.status_code == 200

    results = response.json()
    assert len(results) == 1
    result = results[0]
    assert result["status"] == "error"
    assert result["institution_id"] == str(institution.id)
    assert result["error_code"] == "ITEM_LOGIN_REQUIRED"
