from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from guru.api.config import settings

engine = create_engine(
    settings.database_url,
    echo=settings.debug_sql,
)

Session = sessionmaker(bind=engine)
