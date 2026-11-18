"""Rutas HTTP y operaciones CRUD compartidas de Movie Rental API."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from database.database import get_db
from models.actor import Actor
from models.director import Director
from models.genre import Genre
from models.movie import Movie
from models.rental import Rental
from models.user import User
from schemas.schemas import (
    ActorRead,
    DirectorData,
    DirectorRead,
    GenreData,
    GenreRead,
    MovieRead,
    MovieWrite,
    PersonData,
    PositiveId,
    RentalRead,
    RentalWrite,
    UserData,
    UserRead,
)


router = APIRouter()
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get("/", tags=["Inicio"], summary="Consultar el estado de la API")
def home():
    return {
        "message": "Welcome to Movie Rental API",
        "status": "active"
    }


def get_record(db, model, record_id, detail):
    record = db.get(model, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail=detail)
    return record


def get_related_records(db, model, ids, field):
    unique_ids = list(dict.fromkeys(ids))
    records = db.scalars(select(model).where(model.id.in_(unique_ids))).all()
    records_by_id = {record.id: record for record in records}
    missing = [record_id for record_id in unique_ids if record_id not in records_by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"{field} contiene IDs inexistentes: {missing}.")
    return [records_by_id[record_id] for record_id in unique_ids]


def movie_values(db, data):
    values = data.model_dump()
    actor_ids = values.pop("actor_ids")
    genre_ids = values.pop("genre_ids")

    get_record(db, Director, data.director_id, "El director indicado no existe.")
    values["actors"] = get_related_records(db, Actor, actor_ids, "actor_ids")
    values["genres"] = get_related_records(db, Genre, genre_ids, "genre_ids")
    return values


def rental_values(db, data):
    get_record(db, User, data.user_id, "El usuario indicado no existe.")
    get_record(db, Movie, data.movie_id, "La película indicada no existe.")
    return data.model_dump()


def commit_changes(db, conflict_detail):
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail=conflict_detail) from error


def register_crud(
    path, tag, resource, model, write_schema: type[BaseModel], read_schema, *,
    related=(),
    prepare_values=None,
    write_conflict="Los datos entran en conflicto con otro registro.",
):
    """Registra las cinco operaciones que comparten todas las entidades."""
    item_path = path + "/{record_id}"
    not_found = {404: {"description": "Registro o relación inexistente"}}
    conflict = {409: {"description": "Conflicto de integridad de datos"}}
    missing = f"No se encontró {resource} con ese ID."
    delete_conflict = f"No se puede eliminar {resource} porque tiene registros vinculados."

    @router.get(path, response_model=list[read_schema], tags=[tag], summary=f"Listar {tag.lower()}")
    def list_records(db: DatabaseSession):
        statement = select(model).options(*related).order_by(model.id)
        return db.scalars(statement).all()

    @router.get(
        item_path, response_model=read_schema, tags=[tag],
        summary=f"Consultar {resource}", responses=not_found,
    )
    def read_record(record_id: PositiveId, db: DatabaseSession):
        return get_record(db, model, record_id, missing)

    def create_record(data: BaseModel, db: DatabaseSession):
        values = data.model_dump() if prepare_values is None else prepare_values(db, data)
        record = model(**values)
        db.add(record)
        commit_changes(db, write_conflict)
        db.refresh(record)
        return record

    create_record.__annotations__["data"] = write_schema
    router.post(
        path, response_model=read_schema, status_code=201,
        tags=[tag], summary=f"Crear {resource}",
        responses=not_found | conflict if prepare_values else conflict,
    )(create_record)

    def update_record(record_id: PositiveId, data: BaseModel, db: DatabaseSession):
        record = get_record(db, model, record_id, missing)
        values = data.model_dump() if prepare_values is None else prepare_values(db, data)
        for field, value in values.items():
            setattr(record, field, value)
        commit_changes(db, write_conflict)
        db.refresh(record)
        return record

    update_record.__annotations__["data"] = write_schema
    router.put(
        item_path, response_model=read_schema, tags=[tag],
        summary=f"Actualizar {resource}", responses=not_found | conflict,
        description="Reemplaza el recurso completo. Los campos opcionales omitidos toman su valor por defecto.",
    )(update_record)

    @router.delete(
        item_path, status_code=204, response_class=Response,
        tags=[tag], summary=f"Eliminar {resource}", responses=not_found | conflict,
    )
    def delete_record(record_id: PositiveId, db: DatabaseSession):
        record = get_record(db, model, record_id, missing)
        db.delete(record)
        commit_changes(db, delete_conflict)
        return Response(status_code=204)


register_crud("/actors", "Actores", "el actor", Actor, PersonData, ActorRead)
register_crud("/directors", "Directores", "el director", Director, DirectorData, DirectorRead)
register_crud(
    "/genres", "Géneros", "el género", Genre, GenreData, GenreRead,
    write_conflict="El nombre del género ya está registrado.",
)
register_crud(
    "/users", "Usuarios", "el usuario", User, UserData, UserRead,
    write_conflict="El correo electrónico ya está registrado.",
)
register_crud(
    "/movies", "Películas", "la película", Movie, MovieWrite, MovieRead,
    related=(selectinload(Movie.director), selectinload(Movie.actors), selectinload(Movie.genres)),
    prepare_values=movie_values,
)
register_crud(
    "/rentals", "Alquileres", "el alquiler", Rental, RentalWrite, RentalRead,
    related=(selectinload(Rental.user), selectinload(Rental.movie)),
    prepare_values=rental_values,
)
