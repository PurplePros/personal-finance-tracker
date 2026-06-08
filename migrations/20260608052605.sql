-- Create "institution" table
CREATE TABLE `institution` (
  `id` char NOT NULL,
  `name` varchar NOT NULL,
  `plaid_access_token` varchar NOT NULL,
  `plaid_id` varchar NOT NULL,
  PRIMARY KEY (`id`)
);
-- Create "account" table
CREATE TABLE `account` (
  `id` char NOT NULL,
  `name` varchar NOT NULL,
  `institution_id` char NOT NULL,
  `plaid_id` varchar NOT NULL,
  `type` varchar NOT NULL,
  `holder` varchar NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`institution_id`) REFERENCES `institution` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
);
