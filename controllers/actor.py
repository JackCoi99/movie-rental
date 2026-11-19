"""Controlador para el actor."""

from models.actor import Actor
from schemas.schemas import PersonData

from .crud import make_controller


controller = make_controller(Actor, "el actor", PersonData)