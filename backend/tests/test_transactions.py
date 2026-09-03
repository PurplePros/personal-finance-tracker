"""HTTP-seam tests for transaction sync, categorization, and read endpoints.

Each test programs a faked Plaid, syncs through `POST /api/sync`, then reads
the result back through `GET /api/transactions` - verifiable through the API
alone, never by querying the database directly.
"""

import datetime

from helpers import plaid_account, plaid_transaction


def _seed_credit_card(fake_plaid, seed_institution, token="tok-1", account_id="cc-1"):
    """Seed an institution with a single CAD credit card account."""
    seed_institution(access_token=token)
    fake_plaid.set_accounts(
        token,
        [
            plaid_account(
                account_id=account_id,
                name="Visa",
                plaid_type="credit",
                subtype="credit card",
                current=450.00,
                iso_currency_code="CAD",
            )
        ],
    )


def test_sync_persists_credit_card_transaction(
    client, fake_plaid, seed_institution
):
    """Sync persists a Credit Card transaction with amount, date, merchant, pending."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction(
                transaction_id="txn-1",
                account_id="cc-1",
                amount=42.50,
                date=datetime.date(2026, 6, 15),
                name="STARBUCKS",
                merchant_name="Starbucks",
                pending=True,
            )
        ],
    )

    assert client.post("/api/sync").status_code == 200

    transactions = client.get("/api/transactions").json()
    assert len(transactions) == 1
    txn = transactions[0]
    assert txn["amount"] == 4250  # $42.50 -> 4250 cents
    assert txn["date"] == "2026-06-15"
    assert txn["merchant_name"] == "Starbucks"
    assert txn["pending"] is True


def test_confident_plaid_category_maps_with_source_plaid(
    client, fake_plaid, seed_institution
):
    """A confident Plaid PFC signal maps to the taxonomy with source `plaid`."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction(
                transaction_id="txn-1",
                account_id="cc-1",
                amount=53.20,
                name="LOBLAWS",
                primary_category="FOOD_AND_DRINK",
                detailed_category="FOOD_AND_DRINK_GROCERIES",
                confidence="VERY_HIGH",
            )
        ],
    )
    client.post("/api/sync")

    txn = client.get("/api/transactions").json()[0]
    assert txn["category"] == {
        "major": "Food and personal items",
        "subcategory": "Groceries and personal items",
    }
    assert txn["category_source"] == "plaid"
    assert txn["is_spending"] is True


def test_low_confidence_category_maps_with_low_confidence_source(
    client, fake_plaid, seed_institution
):
    """A below-MEDIUM confidence signal still maps, flagged `plaid_low_confidence`."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction(
                transaction_id="txn-1",
                account_id="cc-1",
                amount=12.00,
                name="SOME MERCHANT",
                primary_category="FOOD_AND_DRINK",
                detailed_category="FOOD_AND_DRINK_RESTAURANT",
                confidence="LOW",
            )
        ],
    )
    client.post("/api/sync")

    txn = client.get("/api/transactions").json()[0]
    assert txn["category"]["major"] == "Food and personal items"
    assert txn["category_source"] == "plaid_low_confidence"


def test_primary_only_signal_lands_in_major_other(
    client, fake_plaid, seed_institution
):
    """When Plaid identifies only the major, the transaction lands in its Other."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction(
                transaction_id="txn-1",
                account_id="cc-1",
                amount=30.00,
                name="UNCLEAR SHOP",
                primary_category="GENERAL_MERCHANDISE",
                detailed_category="GENERAL_MERCHANDISE_OTHER",
                confidence="HIGH",
            )
        ],
    )
    client.post("/api/sync")

    txn = client.get("/api/transactions").json()[0]
    assert txn["category"] == {"major": "Shopping", "subcategory": "Other"}


def test_primary_only_medical_signal_lands_in_major_other(
    client, fake_plaid, seed_institution
):
    """A signal Plaid gives only at the major level lands in that major's Other."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction(
                transaction_id="txn-1",
                account_id="cc-1",
                amount=80.00,
                name="SOME CLINIC",
                primary_category="MEDICAL",
                detailed_category=None,  # Plaid identified only the major
                confidence="HIGH",
            )
        ],
    )
    client.post("/api/sync")

    txn = client.get("/api/transactions").json()[0]
    assert txn["category"] == {"major": "Health and wellness", "subcategory": "Other"}
    assert txn["is_spending"] is True


def test_card_payment_is_not_spending(client, fake_plaid, seed_institution):
    """A credit-card payment lands in Finances / Transfers and does not count."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction(
                transaction_id="txn-pay",
                account_id="cc-1",
                amount=-500.00,  # inflow: the card balance is paid down
                name="PAYMENT THANK YOU",
                primary_category="LOAN_PAYMENTS",
                detailed_category="LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
                confidence="VERY_HIGH",
            )
        ],
    )
    client.post("/api/sync")

    txn = client.get("/api/transactions").json()[0]
    assert txn["category"] == {"major": "Finances", "subcategory": "Transfers"}
    assert txn["is_spending"] is False


def test_bank_fee_and_cash_withdrawal_count_as_spending(
    client, fake_plaid, seed_institution
):
    """Bank fees and cash withdrawals sit under Finances but count as spending."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction(
                transaction_id="txn-fee",
                account_id="cc-1",
                amount=3.50,
                name="INTEREST CHARGE",
                primary_category="BANK_FEES",
                detailed_category="BANK_FEES_INTEREST_CHARGE",
                confidence="HIGH",
            ),
            plaid_transaction(
                transaction_id="txn-atm",
                account_id="cc-1",
                amount=100.00,
                name="ATM WITHDRAWAL",
                primary_category="TRANSFER_OUT",
                detailed_category="TRANSFER_OUT_WITHDRAWAL",
                confidence="HIGH",
            ),
        ],
    )
    client.post("/api/sync")

    by_id = {t["id"]: t for t in client.get("/api/transactions").json()}
    fee = next(t for t in by_id.values() if t["merchant_name"] is None
               and t["category"]["subcategory"] == "Bank fees and interest")
    atm = next(t for t in by_id.values()
               if t["category"]["subcategory"] == "Cash withdrawals")
    assert fee["category"]["major"] == "Finances"
    assert fee["is_spending"] is True
    assert atm["category"]["major"] == "Finances"
    assert atm["is_spending"] is True


def test_refund_carries_negative_amount(client, fake_plaid, seed_institution):
    """A refund nets its Category: negative signed cents under the same Category."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction(
                transaction_id="txn-refund",
                account_id="cc-1",
                amount=-25.00,  # inflow: a return
                name="RETURN - CLOTHING STORE",
                primary_category="GENERAL_MERCHANDISE",
                detailed_category="GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES",
                confidence="HIGH",
            )
        ],
    )
    client.post("/api/sync")

    txn = client.get("/api/transactions").json()[0]
    assert txn["amount"] == -2500  # -$25.00 -> -2500 cents
    assert txn["category"] == {"major": "Shopping", "subcategory": "Clothing"}
    assert txn["is_spending"] is True


def test_only_credit_card_transactions_are_returned(
    client, fake_plaid, seed_institution
):
    """Transactions on non-Credit-Card accounts are not surfaced."""
    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts(
        "tok-1",
        [
            plaid_account(
                account_id="cc-1",
                name="Visa",
                plaid_type="credit",
                subtype="credit card",
                current=100.00,
                iso_currency_code="CAD",
            ),
            plaid_account(
                account_id="chq-1",
                name="Chequing",
                plaid_type="depository",
                subtype="checking",
                current=100.00,
                iso_currency_code="CAD",
            ),
        ],
    )
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction("txn-cc", "cc-1", 10.00, name="Card buy"),
            plaid_transaction("txn-chq", "chq-1", 20.00, name="Chequing buy"),
        ],
    )
    client.post("/api/sync")

    transactions = client.get("/api/transactions").json()
    assert len(transactions) == 1
    assert transactions[0]["merchant_name"] is None
    assert transactions[0]["amount"] == 1000


def test_only_cad_transactions_are_returned(client, fake_plaid, seed_institution):
    """Credit Card transactions in a non-CAD currency are excluded."""
    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts(
        "tok-1",
        [
            plaid_account(
                account_id="cad-cc",
                name="CAD Visa",
                plaid_type="credit",
                subtype="credit card",
                current=100.00,
                iso_currency_code="CAD",
            ),
            plaid_account(
                account_id="usd-cc",
                name="USD Visa",
                plaid_type="credit",
                subtype="credit card",
                current=100.00,
                iso_currency_code="USD",
            ),
        ],
    )
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction("txn-cad", "cad-cc", 10.00),
            plaid_transaction("txn-usd", "usd-cc", 20.00),
        ],
    )
    client.post("/api/sync")

    transactions = client.get("/api/transactions").json()
    assert len(transactions) == 1
    assert transactions[0]["amount"] == 1000  # only the CAD card transaction


def test_date_range_filters_transactions(client, fake_plaid, seed_institution):
    """start and end bound the returned transactions inclusively."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction("txn-jan", "cc-1", 10.0, date=datetime.date(2026, 1, 10)),
            plaid_transaction("txn-jun", "cc-1", 20.0, date=datetime.date(2026, 6, 15)),
            plaid_transaction("txn-dec", "cc-1", 30.0, date=datetime.date(2026, 12, 5)),
        ],
    )
    client.post("/api/sync")

    in_range = client.get(
        "/api/transactions", params={"start": "2026-05-01", "end": "2026-07-01"}
    ).json()
    assert len(in_range) == 1
    assert in_range[0]["date"] == "2026-06-15"


def test_modified_transaction_is_updated_in_place(
    client, fake_plaid, seed_institution
):
    """A later Sync's modified batch updates the row, not duplicates it."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[plaid_transaction("txn-1", "cc-1", 42.50, name="COFFEE", pending=True)],
    )
    client.post("/api/sync")
    original_id = client.get("/api/transactions").json()[0]["id"]

    # Later Sync: same Plaid id posts (pending -> posted).
    fake_plaid.set_transactions(
        "tok-1",
        modified=[
            plaid_transaction("txn-1", "cc-1", 42.50, name="COFFEE", pending=False)
        ],
    )
    client.post("/api/sync")

    transactions = client.get("/api/transactions").json()
    assert len(transactions) == 1
    assert transactions[0]["id"] == original_id
    assert transactions[0]["pending"] is False


def test_removed_transaction_is_deleted(client, fake_plaid, seed_institution):
    """A later Sync's removed batch deletes the transaction."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1", added=[plaid_transaction("txn-1", "cc-1", 10.00)]
    )
    client.post("/api/sync")
    assert len(client.get("/api/transactions").json()) == 1

    fake_plaid.set_transactions("tok-1", removed=["txn-1"])
    client.post("/api/sync")

    assert client.get("/api/transactions").json() == []


def test_pending_to_posted_lifecycle_applied_as_deltas(
    client, fake_plaid, seed_institution
):
    """A pending charge posting as a new id + removal of the old leaves one row."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1",
        added=[plaid_transaction("pending-1", "cc-1", 42.50, pending=True)],
    )
    client.post("/api/sync")

    # Plaid posts a new transaction id linked to the pending one, and removes it.
    fake_plaid.set_transactions(
        "tok-1",
        added=[
            plaid_transaction(
                "posted-1",
                "cc-1",
                42.50,
                pending=False,
                pending_transaction_id="pending-1",
            )
        ],
        removed=["pending-1"],
    )
    client.post("/api/sync")

    transactions = client.get("/api/transactions").json()
    assert len(transactions) == 1
    assert transactions[0]["pending"] is False


def test_transaction_fetch_error_is_isolated_per_institution(
    client, fake_plaid, seed_institution
):
    """One institution's transaction fetch failing does not abort the whole Sync."""
    seed_institution(name="Broken", access_token="tok-broken")
    seed_institution(name="Healthy", access_token="tok-ok")
    fake_plaid.set_accounts(
        "tok-ok",
        [
            plaid_account(
                account_id="cc-ok",
                name="Visa",
                plaid_type="credit",
                subtype="credit card",
                current=100.00,
                iso_currency_code="CAD",
            )
        ],
    )
    fake_plaid.set_transactions(
        "tok-ok", added=[plaid_transaction("txn-ok", "cc-ok", 10.00)]
    )
    fake_plaid.set_transactions_error("tok-broken", RuntimeError("plaid down"))

    response = client.post("/api/sync")
    assert response.status_code == 200

    # The healthy institution's transaction still synced despite the other's failure.
    transactions = client.get("/api/transactions").json()
    assert len(transactions) == 1
    assert transactions[0]["amount"] == 1000


def test_first_sync_backfills_then_later_sync_sends_saved_cursor(
    client, fake_plaid, seed_institution
):
    """The first Sync passes no cursor; the next passes the persisted one."""
    _seed_credit_card(fake_plaid, seed_institution)
    fake_plaid.set_transactions(
        "tok-1", added=[plaid_transaction("txn-1", "cc-1", 10.00)]
    )

    client.post("/api/sync")
    client.post("/api/sync")

    # First call backfills (no cursor); the second forwards the saved cursor.
    assert fake_plaid.fetch_cursors == [None, "cursor-next"]


def test_categories_endpoint_returns_full_taxonomy(client):
    """GET /api/categories returns every major with its Subcategories (incl. Other)."""
    categories = client.get("/api/categories").json()
    by_major = {c["major"]: c["subcategories"] for c in categories}

    assert by_major["Finances"] == [
        "Bank fees and interest",
        "Cash withdrawals",
        "Transfers",
        "Other",
    ]
    # Every non-terminal major ends with Other; Miscellaneous is terminal.
    assert by_major["Food and personal items"][-1] == "Other"
    assert by_major["Miscellaneous"] == []
