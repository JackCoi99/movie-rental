
from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import relationship

from database.database import Base


class Director(Base):
    __tablename__ = "directors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    surname = Column(String, nullable=False)
    bio = Column(Text, nullable=True)
    year = Column(Integer, nullable=True)
    country = Column(String, nullable=True)

    # Un director puede dirigir varias películas
    movies = relationship(
        "Movie",
        back_populates="director"
    )
