🎬 CineClub – API de Alquiler de Películas

📌 Descripción

CineClub es un proyecto de gestión y alquiler de películas desarrollado utilizando Python y FastAPI.

El objetivo del proyecto es crear una API REST que permita gestionar la información relacionada con películas mediante diferentes operaciones. La aplicación utiliza una base de datos SQLite para almacenar la información y está organizada mediante una estructura modular que separa las rutas, los modelos, los esquemas y la configuración de la base de datos.

🚀 Tecnologías utilizadas

Python: Lenguaje de programación principal.

FastAPI: Framework utilizado para desarrollar la API REST.

SQLite: Sistema de gestión de base de datos.

SQLAlchemy: Herramienta ORM para trabajar con la base de datos.

Pydantic: Validación y estructuración de datos.

Uvicorn: Servidor ASGI para ejecutar la aplicación.

📂 Estructura del proyecto

movie-rental/
│
├── database/
│   └── Configuración de la base de datos
│
├── models/
│   └── Modelos de datos
│
├── routes/
│   └── Rutas y endpoints de la API
│
├── schemas/
│   └── Esquemas de validación de datos
│
├── main.py
├── requirements.txt
├── cineclub.db
└── README.md

Organización de los archivos

database/: Contiene la configuración y conexión con la base de datos.

models/: Define los modelos que representan las tablas de la base de datos.

routes/: Contiene los diferentes endpoints para gestionar las operaciones de la API.

schemas/: Define los esquemas utilizados para validar los datos de entrada y salida.

main.py: Archivo principal desde el que se inicia la aplicación FastAPI.

requirements.txt: Contiene las dependencias necesarias para ejecutar el proyecto.

cineclub.db: Base de datos SQLite del proyecto.

⚙️ Instalación y configuración

Para ejecutar el proyecto localmente, sigue estos pasos:

1. Clonar el repositorio

git clone https://github.com/JackCoi99/movie-rental.git

2. Acceder al directorio

cd movie-rental

3. Crear un entorno virtual

python -m venv .venv

4. Activar el entorno virtual

En Windows:

.venv\Scripts\activate

En Linux o macOS:

source .venv/bin/activate

5. Instalar las dependencias

pip install -r requirements.txt

▶️ Ejecución del proyecto

Para iniciar el servidor de desarrollo, ejecuta el siguiente comando:

uvicorn main:app --reload

Una vez iniciado, la API estará disponible en:

http://127.0.0.1:8000

📖 Documentación de la API

FastAPI genera automáticamente una documentación interactiva que permite consultar y probar los diferentes endpoints de la aplicación.

Para acceder a Swagger UI:

http://127.0.0.1:8000/docs

También puedes consultar la documentación alternativa en:

http://127.0.0.1:8000/redoc

🎯 Objetivo del proyecto

Este proyecto tiene como finalidad poner en práctica los conocimientos adquiridos sobre desarrollo backend, creación de APIs REST, gestión de bases de datos y organización del código mediante una arquitectura modular.

CineClub 🎥

Proyecto de desarrollo web y backend con Python y FastAPI.
