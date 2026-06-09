data "external_schema" "sqlalchemy" {
  program = [
    "sh", "-c", "PYTHONPATH=./backend/src .venv/bin/atlas-provider-sqlalchemy --path ./backend/src --dialect sqlite --skip-errors"
  ]
}

env "local" {
  src = data.external_schema.sqlalchemy.url
  url = "sqlite://backend/data.db"
  dev = "sqlite://dev?mode=memory&_fk=1"
  migration {
    dir = "file://migrations"
  }
}
