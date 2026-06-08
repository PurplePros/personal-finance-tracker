.PHONY: db-create db-migrate db-rollback db-inspect

db-create:
	@echo "Creating initial migration from SQLAlchemy models..."
	atlas migrate diff --env local

db-apply:
	@echo "Applying pending migrations..."
	atlas migrate apply --env local

db-rollback:
	atlas migrate down --env local

db-hash:
	atlas migrate hash --env local
