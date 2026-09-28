ALTER TABLE `transactions` ADD `linked_transaction_id` integer REFERENCES `transactions`(`id`) ON DELETE set null;
