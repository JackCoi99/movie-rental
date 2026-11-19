"use strict";

const apiUrl = document.querySelector('meta[name="api-base-url"]').content.replace(/\/$/, "");
const api = window.axios?.create({ baseURL: apiUrl, timeout: 8000 });
const byId = (id) => document.getElementById(id);
const form = byId("movie-form");
const filter = byId("director-filter");
const list = byId("movie-list");
const statusMessage = byId("status");
const errorMessage = byId("error");
const createButton = byId("new-movie");
const views = ["catalog", "detail", "form"];

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
  if (!visible.length) {
    list.append(element("p", filter.value ? "No hay películas de este director." : "El catálogo está vacío."));
    return;
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
      element("span", [movie.year, ...genreNames].join(" · "), "movie-meta"),
      element("h3", movie.name),
      element("p", fullName(movie.director) + " · " + (movie.available ? "Disponible" : "No disponible")),
      button,
    );
    list.append(card);
  }
}

function setOptions(select, options, firstLabel, labelOf) {
  select.replaceChildren(new Option(firstLabel, ""));
  for (const option of options) select.add(new Option(labelOf(option), String(option.id)));
}

async function loadCatalog() {
  await run("Cargando catálogo…", async () => {
    const [movieResult, directorResult] = await Promise.all([api.get("/movies"), api.get("/directors")]);
    movies = movieResult.data;
    directors = directorResult.data;
    const previous = filter.value;
    setOptions(filter, directors, "Todos los directores", fullName);
    if (directors.some(({ id }) => String(id) === previous)) filter.value = previous;
    renderMovies();
    return directors.length ? "Catálogo actualizado." : "Crea un director desde Swagger para poder añadir películas.";
  });
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

function setChoices(container, options, selected, labelOf) {
  container.replaceChildren();
  if (!options.length) container.append(element("p", "No hay opciones registradas."));
  for (const option of options) {
    const label = element("label");
    const input = element("input");
    input.type = "checkbox";
    input.value = String(option.id);
    input.checked = selected.has(option.id);
    label.append(input, document.createTextNode(labelOf(option)));
    container.append(label);
  }
}

function openForm(movie = null) {
  run("Cargando opciones del formulario…", async () => {
    const [directorResult, actorResult, genreResult] = await Promise.all([
      api.get("/directors"), api.get("/actors"), api.get("/genres"),
    ]);
    directors = directorResult.data;
    editingMovie = movie;
    form.reset();
    byId("form-title").textContent = movie ? "Editar película" : "Nueva película";
    byId("name").value = movie?.name ?? "";
    byId("year").value = movie?.year ?? "";
    byId("description").value = movie?.description ?? "";
    byId("available").value = String(movie?.available ?? true);
    setOptions(byId("director"), directors, "Selecciona un director", fullName);
    byId("director").value = movie ? String(movie.director_id) : "";
    setChoices(byId("actors"), actorResult.data, new Set(movie?.actors.map(({ id }) => id)), fullName);
    setChoices(byId("genres"), genreResult.data, new Set(movie?.genres.map(({ id }) => id)), ({ type }) => type);
    showView("form", byId("form-title"));
    return directors.length ? "" : "Crea un director desde Swagger para poder guardar la película.";
  });
}

function checkedIds(id) {
  return [...byId(id).querySelectorAll("input:checked")].map(({ value }) => Number(value));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = byId("name").value.trim();
  if (!name) {
    errorMessage.textContent = "Escribe un título para la película.";
    byId("name").focus();
    return;
  }
  const payload = {
    name,
    year: Number(byId("year").value),
    description: byId("description").value.trim() || null,
    available: byId("available").value === "true",
    director_id: Number(byId("director").value),
    actor_ids: checkedIds("actors"),
    genre_ids: checkedIds("genres"),
  };
  const movie = editingMovie;
  run("Guardando película…", async () => {
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
