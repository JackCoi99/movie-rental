
from sqlalchemy import Column, Integer, Date, ForeignKey
from sqlalchemy.orm import relationship

from database.database import Base


class Rental(Base):
    __tablename__ = "rentals"

    id = Column(Integer, primary_key=True, index=True)

    # Clave foránea del usuario
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False
    )

    # Clave foránea de la película
    movie_id = Column(
        Integer,
        ForeignKey("movies.id", ondelete="RESTRICT"),
        nullable=False
    )

    rental_date = Column(Date, nullable=False)
    return_date = Column(Date, nullable=True)

    # Relación con usuario
    user = relationship(
        "User",
        back_populates="rentals"
    )

    # Relación con película
    movie = relationship(
        "Movie",
        back_populates="rentals"
    )
