-- Add column "balance" to table: "account"
ALTER TABLE `account` ADD COLUMN `balance` numeric NOT NULL;
-- Add column "iso_currency_code" to table: "account"
ALTER TABLE `account` ADD COLUMN `iso_currency_code` varchar NOT NULL;
