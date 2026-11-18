"""Configuración y punto de entrada de Movie Rental API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.database import Base, engine
from routes import router


# Crear las tablas que todavía no existen
Base.metadata.create_all(bind=engine)


# Crear aplicación FastAPI
app = FastAPI(
    title="Movie Rental API",
    description="API REST para la gestión de películas y alquileres",
    version="1.0.0"
)


# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(router)
