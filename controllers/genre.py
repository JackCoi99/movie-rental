"""Controlador para el género."""

from models.genre import Genre
from schemas.schemas import GenreData

from .crud import make_controller


controller = make_controller(
    Genre, "el género", GenreData,
    write_conflict="El nombre del género ya está registrado.",
)
