-- Add column "note" to table: "transaction"
ALTER TABLE `transaction` ADD COLUMN `note` varchar NULL;
-- Create "budget_plan" table
CREATE TABLE `budget_plan` (
  `id` char NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `major` varchar NOT NULL,
  `month` varchar NULL,
  `planned_cents` integer NOT NULL,
  PRIMARY KEY (`id`)
);
-- Create index "uq_budget_plan_major_month" to table: "budget_plan"
CREATE UNIQUE INDEX `uq_budget_plan_major_month` ON `budget_plan` (`major`, `month`);
-- Create "app_settings" table
CREATE TABLE `app_settings` (
  `key` varchar NOT NULL,
  `value` varchar NOT NULL,
  PRIMARY KEY (`key`)
);
