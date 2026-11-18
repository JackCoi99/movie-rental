
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

# Dirección de la base de datos SQLite
DATABASE_URL = "sqlite:///./cineclub.db"

# Motor de conexión
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)


# Activar las claves foráneas de SQLite
@event.listens_for(engine, "connect")
def enable_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# Configuración de las sesiones
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Clase base para los modelos
Base = declarative_base()


# Obtener una sesión de base de datos
def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
