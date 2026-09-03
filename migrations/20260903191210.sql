-- Add column "created_at" to table: "institution"
ALTER TABLE `institution` ADD COLUMN `created_at` datetime NOT NULL;
-- Add column "updated_at" to table: "institution"
ALTER TABLE `institution` ADD COLUMN `updated_at` datetime NOT NULL;
-- Add column "created_at" to table: "account"
ALTER TABLE `account` ADD COLUMN `created_at` datetime NOT NULL;
-- Add column "updated_at" to table: "account"
ALTER TABLE `account` ADD COLUMN `updated_at` datetime NOT NULL;
-- Add column "created_at" to table: "transaction"
ALTER TABLE `transaction` ADD COLUMN `created_at` datetime NOT NULL;
-- Add column "updated_at" to table: "transaction"
ALTER TABLE `transaction` ADD COLUMN `updated_at` datetime NOT NULL;
