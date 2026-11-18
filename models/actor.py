
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from database.database import Base
from models.associations import movie_actor


class Actor(Base):
    __tablename__ = "actors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    surname = Column(String, nullable=False)
    year = Column(Integer, nullable=True)
    country = Column(String, nullable=True)

    # Relación muchos a muchos con películas
    movies = relationship(
        "Movie",
        secondary=movie_actor,
        back_populates="actors"
    )
