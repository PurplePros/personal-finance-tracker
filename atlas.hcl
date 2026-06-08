data "external_schema" "sqlalchemy" {
  program = [
    "atlas-provider-sqlalchemy",
    "--path", "./backend/src/guru/api/models",
    "--dialect", "sqlite"
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
