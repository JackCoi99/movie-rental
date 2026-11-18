
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    ForeignKey
)
from sqlalchemy.orm import relationship

from database.database import Base

from models.associations import movie_actor, movie_genre


class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)

    # Clave foránea del director
    director_id = Column(
        Integer,
        ForeignKey("directors.id", ondelete="RESTRICT"),
        nullable=False
    )

    # Disponibilidad de la película
    available = Column(
        Boolean,
        default=True,
        nullable=False
    )

    # Relación con director
    director = relationship(
        "Director",
        back_populates="movies"
    )

    # Relación con actores
    actors = relationship(
        "Actor",
        secondary=movie_actor,
        back_populates="movies"
    )

    # Relación con géneros
    genres = relationship(
        "Genre",
        secondary=movie_genre,
        back_populates="movies"
    )

    # Relación con alquileres
    rentals = relationship(
        "Rental",
        back_populates="movie"
    )
