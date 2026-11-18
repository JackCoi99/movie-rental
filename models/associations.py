
from sqlalchemy import Table, Column, Integer, ForeignKey

from database.database import Base


# Relación muchos a muchos entre películas y actores
movie_actor = Table(
    "movie_actor",
    Base.metadata,

    Column(
        "movie_id",
        Integer,
        ForeignKey("movies.id", ondelete="CASCADE"),
        primary_key=True
    ),

    Column(
        "actor_id",
        Integer,
        ForeignKey("actors.id", ondelete="CASCADE"),
        primary_key=True
    )
)


# Relación muchos a muchos entre películas y géneros
movie_genre = Table(
    "movie_genre",
    Base.metadata,

    Column(
        "movie_id",
        Integer,
        ForeignKey("movies.id", ondelete="CASCADE"),
        primary_key=True
    ),

    Column(
        "genre_id",
        Integer,
        ForeignKey("genres.id", ondelete="CASCADE"),
        primary_key=True
    )
)
