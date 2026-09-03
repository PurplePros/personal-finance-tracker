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
  CONSTRAINT `0` FOREIGN KEY (`account_id`) REFERENCES `account` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Create index "transaction_plaid_transaction_id" to table: "transaction"
CREATE UNIQUE INDEX `transaction_plaid_transaction_id` ON `transaction` (`plaid_transaction_id`);
