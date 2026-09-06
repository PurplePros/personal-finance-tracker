"""HTTP-seam tests for the app settings API."""


def test_get_settings_returns_default_ratio(client):
    """GET /api/settings returns a default catherine_ratio when none is set."""
    response = client.get("/api/settings")
    assert response.status_code == 200
    data = response.json()
    assert "catherine_ratio" in data
    assert isinstance(data["catherine_ratio"], float)


def test_patch_settings_updates_catherine_ratio(client):
    """PATCH /api/settings updates catherine_ratio."""
    response = client.patch("/api/settings", json={"catherine_ratio": 0.6})
    assert response.status_code == 200
    assert response.json()["catherine_ratio"] == 0.6


def test_get_settings_returns_updated_ratio(client):
    """GET /api/settings returns the previously patched ratio."""
    client.patch("/api/settings", json={"catherine_ratio": 0.6})
    response = client.get("/api/settings")
    assert response.json()["catherine_ratio"] == 0.6


def test_patch_zero_catherine_ratio_returns_422(client):
    """PATCH with catherine_ratio=0 returns 422 (must be strictly between 0 and 1)."""
    response = client.patch("/api/settings", json={"catherine_ratio": 0.0})
    assert response.status_code == 422


def test_patch_one_catherine_ratio_returns_422(client):
    """PATCH with catherine_ratio=1 returns 422 (must be strictly between 0 and 1)."""
    response = client.patch("/api/settings", json={"catherine_ratio": 1.0})
    assert response.status_code == 422


def test_patch_negative_ratio_returns_422(client):
    """PATCH with a negative ratio returns 422."""
    response = client.patch("/api/settings", json={"catherine_ratio": -0.5})
    assert response.status_code == 422
