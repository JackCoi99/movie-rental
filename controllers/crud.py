"""Operaciones CRUD que comparten los controladores."""

from types import SimpleNamespace
from typing import Annotated

from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database.database import get_db
from schemas.schemas import PositiveId


DatabaseSession = Annotated[Session, Depends(get_db)]


def get_record(db, model, record_id, detail):
    record = db.get(model, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail=detail)
    return record


def commit_changes(db, conflict_detail):
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail=conflict_detail) from error


def make_controller(
    model, resource, write_schema: type[BaseModel], *,
    related=(),
    prepare_values=None,
    write_conflict="Los datos entran en conflicto con otro registro.",
):
    """Construye los controladores de una entidad con su esquema de entrada."""
    missing = f"No se encontró {resource} con ese ID."
    delete_conflict = f"No se puede eliminar {resource} porque tiene registros vinculados."

    def list_records(db: DatabaseSession):
        statement = select(model).options(*related).order_by(model.id)
        return db.scalars(statement).all()

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

    def update_record(record_id: PositiveId, data: BaseModel, db: DatabaseSession):
        record = get_record(db, model, record_id, missing)
        values = data.model_dump() if prepare_values is None else prepare_values(db, data)
        for field, value in values.items():
            setattr(record, field, value)
        commit_changes(db, write_conflict)
        db.refresh(record)
        return record

    update_record.__annotations__["data"] = write_schema

    def delete_record(record_id: PositiveId, db: DatabaseSession):
        record = get_record(db, model, record_id, missing)
        db.delete(record)
        commit_changes(db, delete_conflict)
        return Response(status_code=204)

    return SimpleNamespace(
        list_records=list_records,
        read_record=read_record,
        create_record=create_record,
        update_record=update_record,
        delete_record=delete_record,
    )
