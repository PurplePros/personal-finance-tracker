from guru.api.plaid import PlaidService
from guru.api.settings import Settings


def main():
    settings = Settings()
    plaid_service = PlaidService.default(settings.plaid_client_id, settings.plaid_secret)
    plaid_service.list_accounts(access_token="xxx")

if __name__ == "__main__":
    main()
