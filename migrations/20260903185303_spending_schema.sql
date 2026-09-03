-- Add column "transactions_cursor" to table: "institution"
ALTER TABLE `institution` ADD COLUMN `transactions_cursor` varchar NULL;
-- Create "transaction" table
CREATE TABLE `transaction` (
  `id` char NOT NULL,
  `account_id` char NOT NULL,
  `plaid_transaction_id` varchar NOT NULL,
  `pending_transaction_id` varchar NULL,
  `plaid_primary_category` varchar NULL,
  `plaid_detailed_category` varchar NULL,
  `plaid_confidence` varchar NULL,
  `merchant_name` varchar NULL,
  `name` varchar NOT NULL,
  `amount` numeric NOT NULL,
  `date` date NOT NULL,
  `pending` boolean NOT NULL,
  `user_category_major` varchar NULL,
  `user_category_subcategory` varchar NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`account_id`) REFERENCES `account` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT `ck_transaction_user_category_paired` CHECK ((user_category_major IS NULL) = (user_category_subcategory IS NULL))
);
-- Create index "transaction_plaid_transaction_id" to table: "transaction"
CREATE UNIQUE INDEX `transaction_plaid_transaction_id` ON `transaction` (`plaid_transaction_id`);
-- Create index "ix_transaction_account_id" to table: "transaction"
CREATE INDEX `ix_transaction_account_id` ON `transaction` (`account_id`);
-- Create index "ix_transaction_pending_transaction_id" to table: "transaction"
CREATE INDEX `ix_transaction_pending_transaction_id` ON `transaction` (`pending_transaction_id`);
