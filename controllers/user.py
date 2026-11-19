"""Controlador para el usuario."""

from models.user import User
from schemas.schemas import UserData

from .crud import make_controller


controller = make_controller(
    User, "el usuario", UserData,
    write_conflict="El correo electrónico ya está registrado.",
)
