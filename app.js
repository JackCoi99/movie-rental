"use strict";

const apiUrl = document.querySelector('meta[name="api-base-url"]').content.replace(/\/$/, "");
const api = window.axios?.create({ baseURL: apiUrl, timeout: 8000 });
const byId = (id) => document.getElementById(id);
const isDetail = Boolean(byId("detail-view"));
const formHeading = isDetail ? "h2" : "h3";

// Formulario compartido por la portada y la ficha.
byId("form-view").innerHTML = `
  <${formHeading} id="form-title" tabindex="-1"></${formHeading}>
  <form id="movie-form">
    <div class="fields">
      <div>
        <label for="name">Título (obligatorio)</label>
        <input id="name" name="name" required>
      </div>
      <div>
        <label for="year">Año (obligatorio)</label>
        <input id="year" name="year" type="number" min="1" max="9999" required>
      </div>
      <div>
        <label for="director">Dirección (obligatorio)</label>
        <input id="director" name="director" required aria-describedby="director-help">
        <small id="director-help">Escribe el nombre y el apellido.</small>
      </div>
      <div>
        <label for="available">Disponibilidad</label>
        <select id="available" name="available">
          <option value="true">Disponible</option>
          <option value="false">No disponible</option>
        </select>
      </div>
    </div>

    <label for="description">Sinopsis</label>
    <textarea id="description" name="description" rows="4"></textarea>

    <div class="fields relations">
      <div>
        <label for="actors">Reparto (opcional)</label>
        <textarea id="actors" name="actors" rows="3" aria-describedby="actors-help"></textarea>
        <small id="actors-help">Escribe un nombre y apellido por línea o sepáralos con comas.</small>
      </div>
      <div>
        <label for="genres">Géneros (opcional)</label>
        <textarea id="genres" name="genres" rows="3" aria-describedby="genres-help"></textarea>
        <small id="genres-help">Escribe un género por línea o sepáralos con comas.</small>
      </div>
    </div>

    <div class="actions">
      <button type="submit" id="save-movie">Guardar película</button>
      <button type="button" class="secondary" id="cancel-form">Cancelar</button>
    </div>
  </form>
`;

const form = byId("movie-form");
const filter = byId("director-filter");
const list = byId("movie-list");
const statusMessage = byId("status");
const errorMessage = byId("error");
const createButton = byId("new-movie");
const views = ["catalog", "detail", "form"];

let cart = readCart();
let movies = [];
let directors = [];
let selectedMovie = null;
let editingMovie = null;
let busy = false;

for (const link of document.querySelectorAll("[data-api-docs]")) {
  link.href = apiUrl + "/docs";
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function fullName(person) {
  return person ? [person.name, person.surname].filter(Boolean).join(" ") : "Sin dirección";
}

function showView(view, focus) {
  for (const name of views) byId(name + "-view").hidden = name !== view;
  createButton.hidden = view !== "catalog";
  focus?.focus();
}

function errorText(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (error instanceof FormInputError) return error.message;

  if (Array.isArray(detail)) {
    const labels = {
      name: "Título", year: "Año", director_id: "Dirección",
      actor_ids: "Reparto", genre_ids: "Géneros", description: "Sinopsis",
      available: "Disponibilidad",
    };
    const fields = [...new Set(detail.map(({ loc }) => labels[loc?.[1]]).filter(Boolean))];
    return fields.length
      ? "Revisa estos campos: " + fields.join(", ") + "."
      : "Los datos enviados no son válidos.";
  }

  return error.response
    ? "La API no pudo completar la operación (HTTP " + error.response.status + ")."
    : "No se pudo conectar con la API. Comprueba que FastAPI esté en marcha.";
}

async function run(message, operation) {
  if (busy || !api) return;

  busy = true;
  statusMessage.textContent = message;
  errorMessage.textContent = "";
  list.setAttribute("aria-busy", "true");
  const controls = [...document.querySelectorAll(".workspace button, .workspace input, .workspace select, .workspace textarea")];
  const disabledBefore = controls.map((control) => control.disabled);
  for (const control of controls) control.disabled = true;

  try {
    statusMessage.textContent = (await operation()) ?? "";
  } catch (error) {
    statusMessage.textContent = "";
    errorMessage.textContent = errorText(error);
    if (error instanceof FormInputError) invalidField = byId(error.fieldId);
  } finally {
    busy = false;
    list.setAttribute("aria-busy", "false");
    controls.forEach((control, index) => { control.disabled = disabledBefore[index]; });
    createButton.disabled = directors.length === 0;
  }
}

function renderMovies() {
  const visible = movies.filter((movie) => !filter.value || String(movie.director_id) === filter.value);
  list.replaceChildren();

  const summary = byId("movie-search-results");
  if (!visible.length) {
    summary.textContent = query
      ? "No hay películas que coincidan con la búsqueda."
      : "El catálogo está vacío.";
    return;
  }

  summary.textContent = "";
  if (query) {
    summary.textContent = visible.length === 1
      ? "1 película encontrada."
      : visible.length + " películas encontradas.";
  }

  for (const movie of visible) {
    const card = element("article", undefined, "card");
    const genreNames = movie.genres.map((genre) => genre.type);
    const button = element("button", "Ver ficha", "secondary");
    button.type = "button";
    button.id = "movie-" + movie.id;
    button.setAttribute("aria-label", "Ver ficha de " + movie.name);
    button.addEventListener("click", () => openMovie(movie.id));
    card.append(
      element("span", [movie.year, ...genres].join(" · "), "movie-meta"),
      element("h3", movie.name),
      element("p", fullName(movie.director) + " · " + (movie.available ? "Disponible" : "No disponible")),
      button,
    );
    list.append(card);
  }
}

async function loadCatalog() {
  await run("Cargando catálogo…", async () => {
    const [movieResult, directorResult] = await Promise.all([api.get("/movies"), api.get("/directors")]);
    movies = movieResult.data;
    updateRentedMovies(rentalResult.data);
    renderMovies();
    return directors.length ? "Catálogo actualizado." : "Crea un director desde Swagger para poder añadir películas.";
  });
}

function setRentalUsers() {
  rentalUser.replaceChildren(new Option("Selecciona un usuario", ""));
  for (const user of rentalUsers) rentalUser.add(new Option(user.name, String(user.id)));
}

function showMovie(movie) {
  selectedMovie = movie;
  byId("detail-title").textContent = movie.name;
  byId("detail-description").textContent = movie.description || "Sin sinopsis.";

  const data = byId("detail-data");
  data.replaceChildren();

  for (const [label, value] of [
    ["Año", movie.year],
    ["Dirección", fullName(movie.director)],
    ["Reparto", movie.actors.map(fullName).join(", ") || "Sin reparto asociado"],
    ["Géneros", movie.genres.map((genre) => genre.type).join(", ") || "Sin géneros asociados"],
    ["Disponibilidad", movie.available ? "Disponible" : "No disponible"],
  ]) {
    data.append(element("dt", label), element("dd", value));
  }
  showView("detail", byId("detail-title"));
}

function openMovie(id) {
  run("Cargando ficha…", async () => {
    const { data } = await api.get("/movies/" + id);
    showMovie(data);
    return "Ficha cargada.";
  });
}

function backToCatalog(id) {
  showView("catalog", byId("movie-" + id) ?? byId("catalog-title"));
}

function openForm(movie = null) {
  errorMessage.textContent = "";
  statusMessage.textContent = "";
  editingMovie = movie;
  form.reset();

  byId("form-title").textContent = movie ? "Editar película" : "Nueva película";
  byId("name").value = movie?.name ?? "";
  byId("year").value = movie?.year ?? "";
  byId("description").value = movie?.description ?? "";
  byId("available").value = String(movie?.available ?? true);
  byId("director").value = movie ? fullName(movie.director) : "";
  byId("actors").value = movie?.actors.map(fullName).join("\n") ?? "";
  byId("genres").value = movie?.genres.map(({ type }) => type).join("\n") ?? "";

  showView("form", byId("form-title"));
}

function relationNames(value) {
  return value.split(/[,\n]+/).map((text) => text.trim()).filter(Boolean);
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ").normalize("NFC").toLowerCase();
}

class FormInputError extends Error {
  constructor(fieldId, message) {
    super(message);
    this.fieldId = fieldId;
  }
}

function personData(value, fieldId) {
  const [name, ...surname] = value.trim().split(/\s+/);
  if (!name || !surname.length) {
    const label = fieldId === "director" ? "Dirección" : "Reparto";
    throw new FormInputError(fieldId, label + ": escribe un nombre y un apellido para «" + value + "».");
  }
  return { name, surname: surname.join(" ") };
}

async function resolveIds(path, names, records, preferred, getLabel, toPayload) {
  const ids = new Set();

  for (const name of names) {
    const key = normalizeName(name);
    const selected = preferred.filter((record) => normalizeName(getLabel(record)) === key);
    if (selected.length) {
      for (const record of selected) ids.add(record.id);
      continue;
    }

    let record = records.find((item) => normalizeName(getLabel(item)) === key);
    if (!record) {
      ({ data: record } = await api.post(path, toPayload(name)));
      records.push(record);
    }
    ids.add(record.id);
  }

  return [...ids];
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = byId("name").value.trim();
  if (!name) {
    errorMessage.textContent = "Escribe un título para la película.";
    byId("name").focus();
    return;
  }

  const movie = editingMovie;
  const directorName = byId("director").value.trim();
  const actorNames = relationNames(byId("actors").value);
  const genreNames = relationNames(byId("genres").value);
  const payload = {
    name,
    year: Number(byId("year").value),
    description: byId("description").value.trim() || null,
    available: byId("available").value === "true",
  };

  run("Guardando película…", async () => {
    const [directorResult, actorResult, genreResult] = await Promise.all([
      api.get("/directors"), api.get("/actors"), api.get("/genres"),
    ]);
    const knownDirectors = directorResult.data;
    const knownActors = actorResult.data;
    const previousDirector = movie ? [movie.director] : [];
    const previousActors = movie?.actors ?? [];

    // Validar todos los nombres nuevos antes de crear relaciones.
    for (const [names, records, fieldId] of [
      [[directorName], [...previousDirector, ...knownDirectors], "director"],
      [actorNames, [...previousActors, ...knownActors], "actors"],
    ]) {
      for (const person of names) {
        if (!records.some((record) => normalizeName(fullName(record)) === normalizeName(person))) {
          personData(person, fieldId);
        }
      }
    }

    [payload.director_id] = await resolveIds(
      "/directors", [directorName], knownDirectors, previousDirector,
      fullName, (value) => personData(value, "director"),
    );
    payload.actor_ids = await resolveIds(
      "/actors", actorNames, knownActors, previousActors,
      fullName, (value) => personData(value, "actors"),
    );
    payload.genre_ids = await resolveIds(
      "/genres", genreNames, genreResult.data, movie?.genres ?? [],
      ({ type }) => type, (type) => ({ type }),
    );

    const { data } = movie
      ? await api.put("/movies/" + movie.id, payload)
      : await api.post("/movies", payload);
    movies = movie ? movies.map((item) => item.id === data.id ? data : item) : [...movies, data];
    renderMovies();
    showMovie(data);
    return movie ? "Película actualizada." : "Película creada.";
  });
});

byId("delete-movie").addEventListener("click", () => {
  const movie = selectedMovie;
  if (!movie || !window.confirm("¿Eliminar «" + movie.name + "» del catálogo?")) return;

  run("Eliminando película…", async () => {
    await api.delete("/movies/" + movie.id);
    movies = movies.filter(({ id }) => id !== movie.id);
    selectedMovie = null;
    renderMovies();
    backToCatalog();
    return "Película eliminada.";
  });
});

byId("reload").addEventListener("click", loadCatalog);
filter.addEventListener("change", () => {
  renderMovies();
  statusMessage.textContent = "Filtro aplicado.";
});
createButton.addEventListener("click", () => openForm());
byId("edit-movie").addEventListener("click", () => openForm(selectedMovie));
byId("cancel-form").addEventListener("click", () => {
  if (editingMovie) showMovie(editingMovie);
  else backToCatalog();
});
document.querySelector("[data-back]").addEventListener("click", () => backToCatalog(selectedMovie?.id));

if (api) loadCatalog();
else errorMessage.textContent = "No se pudo cargar Axios. Comprueba tu conexión y recarga la página.";
