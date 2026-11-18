"""Esquemas de entrada y salida de la API."""

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
PositiveId = Annotated[int, Field(gt=0, le=2**63 - 1)]
Year = Annotated[int, Field(gt=0, le=9999)]


class RequestData(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PersonData(RequestData):
    name: RequiredText
    surname: RequiredText
    year: Year | None = None
    country: str | None = None


class DirectorData(PersonData):
    bio: str | None = None


class GenreData(RequestData):
    type: RequiredText


class UserData(RequestData):
    name: RequiredText
    email: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$",
        ),
    ]


class MovieData(RequestData):
    name: RequiredText
    year: Year
    description: str | None = None
    available: bool = True


class MovieWrite(MovieData):
    director_id: PositiveId
    actor_ids: list[PositiveId] = Field(
        default_factory=list, description="IDs de los actores. Una lista vacía elimina los vínculos en PUT."
    )
    genre_ids: list[PositiveId] = Field(
        default_factory=list, description="IDs de los géneros. Una lista vacía elimina los vínculos en PUT."
    )


class RentalData(RequestData):
    rental_date: date
    return_date: date | None = Field(
        default=None, description="Fecha efectiva de devolución. Usa null si aún no se ha devuelto."
    )


class RentalWrite(RentalData):
    user_id: PositiveId
    movie_id: PositiveId

    @model_validator(mode="after")
    def validate_return_date(self):
        if self.return_date is not None and self.return_date < self.rental_date:
            raise ValueError(
                "La fecha de devolución debe ser igual o posterior a la de alquiler."
            )
        return self


class Record(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ActorRead(PersonData, Record):
    pass


class DirectorRead(DirectorData, Record):
    pass


class GenreRead(GenreData, Record):
    pass


class UserRead(UserData, Record):
    # Permite consultar registros antiguos que preceden a la validación del correo.
    email: str


class MovieSummary(MovieData, Record):
    pass


class MovieRead(MovieSummary):
    director_id: int
    director: DirectorRead
    actors: list[ActorRead]
    genres: list[GenreRead]


class RentalRead(RentalData, Record):
    user_id: int
    movie_id: int
    user: UserRead
    movie: MovieSummary
