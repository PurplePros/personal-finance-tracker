"""HTTP-seam tests for the budget plan API."""


def test_get_budget_plan_returns_empty_list_initially(client):
    """GET /api/budget/plan returns an empty list when no entries exist."""
    response = client.get("/api/budget/plan")
    assert response.status_code == 200
    assert response.json() == []


def test_put_template_creates_entry(client):
    """PUT /api/budget/plan/{major} creates a template entry (month=null)."""
    response = client.put("/api/budget/plan/Housing", json={"planned_cents": 200000})
    assert response.status_code == 200
    result = response.json()
    assert result["major"] == "Housing"
    assert result["month"] is None
    assert result["planned_cents"] == 200000


def test_get_returns_created_template(client):
    """GET /api/budget/plan returns the template entry after creation."""
    client.put("/api/budget/plan/Housing", json={"planned_cents": 200000})

    entries = client.get("/api/budget/plan").json()
    assert len(entries) == 1
    assert entries[0]["major"] == "Housing"
    assert entries[0]["month"] is None
    assert entries[0]["planned_cents"] == 200000


def test_put_template_updates_existing(client):
    """PUT /api/budget/plan/{major} upserts: a second PUT updates the same row."""
    client.put("/api/budget/plan/Housing", json={"planned_cents": 200000})
    client.put("/api/budget/plan/Housing", json={"planned_cents": 250000})

    entries = client.get("/api/budget/plan").json()
    housing_entries = [e for e in entries if e["major"] == "Housing" and e["month"] is None]
    assert len(housing_entries) == 1
    assert housing_entries[0]["planned_cents"] == 250000


def test_put_month_override_creates_separate_entry(client):
    """PUT /api/budget/plan/{major}/{month} creates a month-specific override."""
    client.put("/api/budget/plan/Housing", json={"planned_cents": 200000})
    response = client.put("/api/budget/plan/Housing/2026-09", json={"planned_cents": 180000})
    assert response.status_code == 200
    result = response.json()
    assert result["major"] == "Housing"
    assert result["month"] == "2026-09"
    assert result["planned_cents"] == 180000


def test_get_returns_both_template_and_override(client):
    """GET returns both the template and any month overrides."""
    client.put("/api/budget/plan/Housing", json={"planned_cents": 200000})
    client.put("/api/budget/plan/Housing/2026-09", json={"planned_cents": 180000})

    entries = client.get("/api/budget/plan").json()
    housing = [e for e in entries if e["major"] == "Housing"]
    months = {e["month"] for e in housing}
    assert months == {None, "2026-09"}


def test_month_override_does_not_affect_template(client):
    """Setting a month override does not change the template entry."""
    client.put("/api/budget/plan/Housing", json={"planned_cents": 200000})
    client.put("/api/budget/plan/Housing/2026-09", json={"planned_cents": 180000})

    entries = client.get("/api/budget/plan").json()
    template = next(e for e in entries if e["major"] == "Housing" and e["month"] is None)
    assert template["planned_cents"] == 200000


def test_updating_template_does_not_affect_override(client):
    """Updating the template does not change an existing month override."""
    client.put("/api/budget/plan/Housing", json={"planned_cents": 200000})
    client.put("/api/budget/plan/Housing/2026-09", json={"planned_cents": 180000})
    client.put("/api/budget/plan/Housing", json={"planned_cents": 220000})

    entries = client.get("/api/budget/plan").json()
    override = next(e for e in entries if e["major"] == "Housing" and e["month"] == "2026-09")
    assert override["planned_cents"] == 180000


def test_put_month_invalid_format_returns_422(client):
    """PUT with a month not matching YYYY-MM returns 422."""
    response = client.put("/api/budget/plan/Housing/September", json={"planned_cents": 100000})
    assert response.status_code == 422
