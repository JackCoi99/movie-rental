
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from database.database import Base
from models.associations import movie_genre


class Genre(Base):
    __tablename__ = "genres"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, unique=True, nullable=False)

    # Relación muchos a muchos con películas
    movies = relationship(
        "Movie",
        secondary=movie_genre,
        back_populates="genres"
    )
