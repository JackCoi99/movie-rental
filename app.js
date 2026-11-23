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
const rentalForm = byId("rental-form");
const rentalUser = byId("rental-user");
const search = byId("movie-search");
const list = byId("movie-list");
const statusMessage = byId("status");
const errorMessage = byId("error");
const createButton = byId("new-movie");
const views = ["catalog", "detail", "form"];
const cartKey = "movie-rental-cart";

let cart = readCart();
let movies = [];
let rentalUsers = [];
let rentedMovieIds = new Set();
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
  for (const name of views) {
    const section = byId(name + "-view");
    if (section) section.hidden = name !== view;
  }
  if (createButton) createButton.hidden = view !== "catalog";
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
      available: "Disponibilidad", user_id: "Usuario", movie_id: "Película",
      rental_date: "Fecha de alquiler",
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
  list?.setAttribute("aria-busy", "true");

  let invalidField;
  const controls = [...document.querySelectorAll(
    ".workspace button, .workspace input, .workspace select, .workspace textarea",
  )];
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
    list?.setAttribute("aria-busy", "false");
    controls.forEach((control, index) => {
      control.disabled = disabledBefore[index];
    });
    invalidField?.focus();

    if (isDetail && selectedMovie) {
      byId("pay-movie").disabled = !canRent(selectedMovie) || !rentalUsers.length;
      byId("cart-movie").disabled = !canRent(selectedMovie);
    }
  }
}

function readCart() {
  try {
    const items = JSON.parse(localStorage.getItem(cartKey) || "[]");
    return Array.isArray(items)
      ? items.filter((item) => Number.isSafeInteger(item?.id) && item.id > 0 && typeof item.name === "string")
      : [];
  } catch {
    return [];
  }
}

function movieUrl(id) {
  return "movie.html?id=" + encodeURIComponent(id);
}

function setPoster(poster, movie) {
  poster.setAttribute("data-art", String((movie.id - 1) % 4));
  poster.textContent = movie.name;
}

function renderCart() {
  byId("cart-count").textContent = cart.length;
  const items = byId("cart-items");
  items.replaceChildren();

  if (!cart.length) items.append(element("li", "El carrito está vacío."));

  for (const item of cart) {
    const row = element("li");
    const link = element("a", item.name);
    link.href = movieUrl(item.id);

    const remove = element("button", "Quitar", "secondary");
    remove.type = "button";
    remove.setAttribute("aria-label", "Quitar " + item.name + " del carrito");
    remove.addEventListener("click", () => {
      saveCart(cart.filter(({ id }) => id !== item.id));
      const next = items.querySelector("button") ?? byId("cart-dialog").querySelector("button");
      next?.focus();
    });

    row.append(link, remove);
    items.append(row);
  }
}

function saveCart(items) {
  cart = items;
  try {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  } catch {
    errorMessage.textContent = "El carrito no se puede conservar al recargar la página.";
  }
  renderCart();
}

function addToCart(movie) {
  if (!canRent(movie)) return;
  if (cart.some(({ id }) => id === movie.id)) {
    statusMessage.textContent = "La película ya está en el carrito.";
    return;
  }

  saveCart([...cart, { id: movie.id, name: movie.name }]);
  statusMessage.textContent = movie.name + " se añadió al carrito.";
}

function renderPremieres() {
  const grid = byId("premieres");
  grid.replaceChildren();

  const latest = [...movies].sort((a, b) => b.year - a.year || b.id - a.id).slice(0, 4);
  if (!latest.length) grid.append(element("p", "El catálogo todavía está vacío."));

  for (const movie of latest) {
    const card = element("article", undefined, "premiere-card");
    const poster = element("div", undefined, "poster");
    poster.setAttribute("aria-hidden", "true");
    setPoster(poster, movie);

    const link = element("a", "Ver película", "button");
    link.href = movieUrl(movie.id);
    link.setAttribute("aria-label", "Ver película: " + movie.name);

    const add = element("button", "+", "secondary");
    add.type = "button";
    add.disabled = !canRent(movie);
    add.setAttribute("aria-label", "Añadir " + movie.name + " al carrito");
    add.addEventListener("click", () => addToCart(movie));

    const actions = element("div", undefined, "poster-actions");
    actions.append(link, add);
    card.append(poster, element("h3", movie.name), element("p", movie.year), actions);
    grid.append(card);
  }
}

function canRent(movie) {
  return movie.available && !rentedMovieIds.has(movie.id);
}

function updateRentedMovies(rentals) {
  rentedMovieIds = new Set(
    rentals.filter((rental) => rental.return_date == null).map((rental) => rental.movie_id),
  );
}

function renderMovies() {
  if (!list) return;
  renderPremieres();
  renderSearchResults();
}

function normalizeSearch(value) {
  return normalizeName(value).normalize("NFD").replace(/\p{M}/gu, "");
}

function matchesSearch(movie, query, terms) {
  const available = canRent(movie);
  if (query === "disponible") return available;
  if (query === "no disponible") return !available;

  const people = [movie.director, ...movie.actors].filter(Boolean);
  const searchableText = normalizeSearch([
    movie.name,
    movie.year,
    movie.description,
    available ? "disponible" : "no disponible",
    ...people.flatMap((person) => [fullName(person), person.country, person.year]),
    movie.director?.bio,
    ...movie.genres.map(({ type }) => type),
  ].join(" "));

  return terms.every((term) => searchableText.includes(term));
}

function renderSearchResults() {
  const query = normalizeSearch(search.value);
  const terms = query.split(" ");
  const visible = query ? movies.filter((movie) => matchesSearch(movie, query, terms)) : movies;
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
    const genres = movie.genres.map(({ type }) => type);
    const link = element("a", canRent(movie) ? "Ver y alquilar" : "Ver ficha", "button secondary");
    link.href = movieUrl(movie.id);
    link.id = "movie-" + movie.id;
    link.setAttribute("aria-label", link.textContent + " · " + movie.name);

    card.append(
      element("span", [movie.year, ...genres].join(" · "), "movie-meta"),
      element("h3", movie.name),
      element("p", fullName(movie.director) + " · " + (canRent(movie) ? "Disponible" : "No disponible")),
      link,
    );
    list.append(card);
  }
}

async function loadCatalog() {
  await run("Cargando catálogo…", async () => {
    const [movieResult, rentalResult] = await Promise.all([
      api.get("/movies"), api.get("/rentals"),
    ]);
    movies = movieResult.data;
    updateRentedMovies(rentalResult.data);
    renderMovies();

    if (params.get("deleted") === "1") {
      params.delete("deleted");
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      return "Película eliminada.";
    }

    return "Catálogo actualizado.";
  });
}

function setRentalUsers() {
  rentalUser.replaceChildren(new Option("Selecciona un usuario", ""));
  for (const user of rentalUsers) rentalUser.add(new Option(user.name, String(user.id)));
}

function showMovie(movie) {
  selectedMovie = movie;
  setPoster(byId("detail-poster"), movie);
  rentalForm.hidden = true;
  byId("pay-movie").setAttribute("aria-expanded", "false");
  byId("pay-movie").disabled = !canRent(movie) || !rentalUsers.length;
  byId("cart-movie").disabled = !canRent(movie);
  byId("detail-title").textContent = movie.name;
  byId("detail-description").textContent = movie.description || "Sin sinopsis.";

  const data = byId("detail-data");
  data.replaceChildren();

  for (const [label, value] of [
    ["Año", movie.year],
    ["Dirección", fullName(movie.director)],
    ["Reparto", movie.actors.map(fullName).join(", ") || "Sin reparto asociado"],
    ["Géneros", movie.genres.map(({ type }) => type).join(", ") || "Sin géneros asociados"],
    ["Disponibilidad", canRent(movie) ? "Disponible para alquilar" : "No disponible"],
  ]) {
    data.append(element("dt", label), element("dd", value));
  }

  byId("rental-controls").hidden = !canRent(movie) || !rentalUsers.length;
  const help = byId("rental-help");

  if (!canRent(movie)) {
    help.textContent = "Esta película no está disponible para alquilar.";
  } else if (!rentalUsers.length) {
    help.textContent = "Crea un usuario desde Swagger para registrar el alquiler.";
  } else {
    help.textContent = "Selecciona el usuario que quedará asociado al alquiler.";
  }

  setRentalUsers();
  showView("detail", byId("detail-title"));
}

function openMovie(id) {
  run("Cargando ficha…", async () => {
    const [movieResult, userResult, rentalResult] = await Promise.all([
      api.get("/movies/" + id), api.get("/users"), api.get("/rentals"),
    ]);
    updateRentedMovies(rentalResult.data);
    rentalUsers = userResult.data;
    showMovie(movieResult.data);
    return "Ficha cargada.";
  });
}

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

rentalForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const movie = selectedMovie;
  const userId = Number(rentalUser.value);
  if (!movie || !canRent(movie) || !userId) return;

  run("Registrando alquiler…", async () => {
    const [movieResult, rentalResult] = await Promise.all([
      api.get("/movies/" + movie.id), api.get("/rentals"),
    ]);
    updateRentedMovies(rentalResult.data);

    if (!canRent(movieResult.data)) {
      showMovie(movieResult.data);
      return "La película ya no está disponible para alquilar.";
    }

    const { data } = await api.post("/rentals", {
      user_id: userId,
      movie_id: movie.id,
      rental_date: today(),
      return_date: null,
    });

    rentedMovieIds.add(movie.id);
    saveCart(cart.filter(({ id }) => id !== movie.id));
    showMovie(movieResult.data);
    return "Alquiler confirmado. Referencia: " + data.id + ".";
  });
});

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

    if (isDetail) {
      showMovie(data);
    } else {
      movies = movie ? movies.map((item) => item.id === data.id ? data : item) : [...movies, data];
      renderMovies();
      backToCatalog(data.id);
    }

    return movie ? "Película actualizada." : "Película creada.";
  });
});

byId("delete-movie")?.addEventListener("click", () => {
  const movie = selectedMovie;
  if (!movie || !window.confirm("¿Eliminar «" + movie.name + "» del catálogo?")) return;

  run("Eliminando película…", async () => {
    await api.delete("/movies/" + movie.id);
    saveCart(cart.filter(({ id }) => id !== movie.id));
    window.location.href = "index.html?deleted=1#catalogo";
  });
});

byId("reload")?.addEventListener("click", loadCatalog);
search?.addEventListener("input", renderSearchResults);
createButton?.addEventListener("click", () => openForm());
byId("edit-movie")?.addEventListener("click", () => openForm(selectedMovie));

byId("cancel-form").addEventListener("click", () => {
  if (editingMovie) showMovie(editingMovie);
  else backToCatalog();
});

byId("open-cart").addEventListener("click", () => byId("cart-dialog").showModal());
byId("cart-movie")?.addEventListener("click", () => addToCart(selectedMovie));

byId("pay-movie")?.addEventListener("click", () => {
  rentalForm.hidden = !rentalForm.hidden;
  byId("pay-movie").setAttribute("aria-expanded", String(!rentalForm.hidden));
  if (!rentalForm.hidden) rentalUser.focus();
});

renderCart();

const params = new URLSearchParams(window.location.search);

if (!api) {
  errorMessage.textContent = "No se pudo cargar Axios. Comprueba tu conexión y recarga la página.";
} else if (isDetail) {
  const id = Number(params.get("id"));
  if (Number.isSafeInteger(id) && id > 0) openMovie(id);
  else errorMessage.textContent = "No se ha indicado una película válida. Vuelve al catálogo.";
} else {
  loadCatalog();
}