"""Controlador para el director"""

from models.director import Director
from schemas.schemas import DirectorData

from .crud import make_controller


controller = make_controller(Director, "el director", DirectorData)