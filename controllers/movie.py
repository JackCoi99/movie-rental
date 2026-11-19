"""Controlador para la película."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models.actor import Actor
from models.director import Director
from models.genre import Genre
from models.movie import Movie
from schemas.schemas import MovieWrite

from .crud import get_record, make_controller


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


controller = make_controller(
    Movie, "la película", MovieWrite,
    related=(selectinload(Movie.director), selectinload(Movie.actors), selectinload(Movie.genres)),
    prepare_values=movie_values,
)
