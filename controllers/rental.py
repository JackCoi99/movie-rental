"""Controlador para el alquiler."""

from sqlalchemy.orm import selectinload

from models.movie import Movie
from models.rental import Rental
from models.user import User
from schemas.schemas import RentalWrite

from .crud import get_record, make_controller


def rental_values(db, data):
    get_record(db, User, data.user_id, "El usuario indicado no existe.")
    get_record(db, Movie, data.movie_id, "La película indicada no existe.")
    return data.model_dump()


controller = make_controller(
    Rental, "el alquiler", RentalWrite,
    related=(selectinload(Rental.user), selectinload(Rental.movie)),
    prepare_values=rental_values,
)
