-- Make Plaid fields nullable on institution, account, and transaction to support
-- Manual Institutions (non-Plaid providers) and Manual Transactions (see ADR 0002).

-- Recreate institution with nullable plaid_access_token and plaid_id.
PRAGMA foreign_keys = OFF;

CREATE TABLE `institution_new` (
  `id` char NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `name` varchar NOT NULL,
  `plaid_access_token` varchar NULL,
  `plaid_id` varchar NULL,
  `plaid_item_id` varchar NULL,
  `holder` varchar NOT NULL DEFAULT '',
  `transactions_cursor` varchar NULL,
  PRIMARY KEY (`id`)
);
INSERT INTO `institution_new` SELECT
  `id`, `created_at`, `updated_at`, `name`, `plaid_access_token`, `plaid_id`,
  `plaid_item_id`, `holder`, `transactions_cursor`
FROM `institution`;
DROP TABLE `institution`;
ALTER TABLE `institution_new` RENAME TO `institution`;

-- Recreate account with nullable plaid_id and new 'Manual' as a valid type value.
CREATE TABLE `account_new` (
  `id` char NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `name` varchar NOT NULL,
  `institution_id` char NOT NULL,
  `plaid_id` varchar NULL,
  `type` varchar NOT NULL,
  `balance` decimal(20, 2) NOT NULL,
  `iso_currency_code` varchar NOT NULL,
  PRIMARY KEY (`id`)
);
INSERT INTO `account_new` SELECT
  `id`, `created_at`, `updated_at`, `name`, `institution_id`, `plaid_id`,
  `type`, `balance`, `iso_currency_code`
FROM `account`;
DROP TABLE `account`;
ALTER TABLE `account_new` RENAME TO `account`;

-- Recreate transaction with nullable plaid_transaction_id.
-- SQLite UNIQUE allows multiple NULLs (NULL != NULL), so manual transactions coexist.
CREATE TABLE `transaction_new` (
  `id` char NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `account_id` char NOT NULL,
  `plaid_transaction_id` varchar NULL UNIQUE,
  `pending_transaction_id` varchar NULL,
  `plaid_primary_category` varchar NULL,
  `plaid_detailed_category` varchar NULL,
  `plaid_confidence` varchar NULL,
  `merchant_name` varchar NULL,
  `name` varchar NOT NULL,
  `amount` decimal(20, 2) NOT NULL,
  `date` date NOT NULL,
  `pending` boolean NOT NULL DEFAULT 0,
  `user_category_major` varchar NULL,
  `user_category_subcategory` varchar NULL,
  `note` varchar NULL,
  PRIMARY KEY (`id`),
  CHECK ((user_category_major IS NULL) = (user_category_subcategory IS NULL))
);
INSERT INTO `transaction_new` SELECT
  `id`, `created_at`, `updated_at`, `account_id`, `plaid_transaction_id`,
  `pending_transaction_id`, `plaid_primary_category`, `plaid_detailed_category`,
  `plaid_confidence`, `merchant_name`, `name`, `amount`, `date`, `pending`,
  `user_category_major`, `user_category_subcategory`, `note`
FROM `transaction`;
DROP TABLE `transaction`;
ALTER TABLE `transaction_new` RENAME TO `transaction`;
CREATE INDEX `ix_transaction_account_id` ON `transaction` (`account_id`);
CREATE INDEX `ix_transaction_pending_transaction_id` ON `transaction` (`pending_transaction_id`);

PRAGMA foreign_keys = ON;
