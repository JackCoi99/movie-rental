"""Registro de rutas HTTP de Movie Rental API."""

from fastapi import APIRouter, Response

from controllers import actor, director, genre, movie, rental, user
from controllers.home import home
from schemas.schemas import ActorRead, DirectorRead, GenreRead, MovieRead, RentalRead, UserRead


router = APIRouter()
router.get("/", tags=["Inicio"], summary="Consultar el estado de la API")(home)


def register_crud(path, tag, resource, controller, read_schema, *, has_relations=False):
    item_path = path + "/{record_id}"
    not_found = {404: {"description": "Registro o relación inexistente"}}
    conflict = {409: {"description": "Conflicto de integridad de datos"}}

    router.get(path, response_model=list[read_schema], tags=[tag], summary=f"Listar {tag.lower()}")(
        controller.list_records
    )
    router.get(
        item_path, response_model=read_schema, tags=[tag],
        summary=f"Consultar {resource}", responses=not_found,
    )(controller.read_record)
    router.post(
        path, response_model=read_schema, status_code=201,
        tags=[tag], summary=f"Crear {resource}",
        responses=not_found | conflict if has_relations else conflict,
    )(controller.create_record)
    router.put(
        item_path, response_model=read_schema, tags=[tag],
        summary=f"Actualizar {resource}", responses=not_found | conflict,
        description="Reemplaza el recurso completo. Los campos opcionales omitidos toman su valor por defecto.",
    )(controller.update_record)
    router.delete(
        item_path, status_code=204, response_class=Response,
        tags=[tag], summary=f"Eliminar {resource}", responses=not_found | conflict,
    )(controller.delete_record)


register_crud("/actors", "Actores", "el actor", actor.controller, ActorRead)
register_crud("/directors", "Directores", "el director", director.controller, DirectorRead)
register_crud(
    "/genres", "Géneros", "el género", genre.controller, GenreRead,
)
register_crud(
    "/users", "Usuarios", "el usuario", user.controller, UserRead,
)
register_crud(
    "/movies", "Películas", "la película", movie.controller, MovieRead,
    has_relations=True,
)
register_crud(
    "/rentals", "Alquileres", "el alquiler", rental.controller, RentalRead,
    has_relations=True,
)
