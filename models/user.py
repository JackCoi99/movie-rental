
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from database.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)

    # Un usuario puede realizar varios alquileres
    rentals = relationship(
        "Rental",
        back_populates="user"
    )
