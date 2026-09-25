// Хендлеры для пользователей и справочников (группы/направления).
// Соответствуют API.getUsers / API.getUser / API.getGroups / API.getDirections.
package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"studnet-backend/internal/httpx"
	"studnet-backend/internal/store"
)

type UsersHandler struct {
	store *store.Store
}

func NewUsersHandler(s *store.Store) *UsersHandler {
	return &UsersHandler{store: s}
}

// List — GET /api/users?group=..&direction=..&course=..&online=true
// Аналог API.getUsers(filters) — параметры фильтра читаем из query-строки
// URL, а не из тела запроса, потому что это GET (стандартная практика
// для запросов, которые просто "что-то читают", а не изменяют данные).
func (h *UsersHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	filter := store.UserFilter{
		Group:     q.Get("group"),
		Direction: q.Get("direction"),
		OnlyOnline: q.Get("online") == "true",
	}
	if courseStr := q.Get("course"); courseStr != "" {
		if course, err := strconv.Atoi(courseStr); err == nil {
			filter.Course = course
		}
	}

	users := h.store.ListUsers(filter)
	httpx.JSON(w, http.StatusOK, users)
}

// Get — GET /api/users/{id}
func (h *UsersHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "Некорректный id")
		return
	}

	user, err := h.store.UserByID(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "Пользователь не найден")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "Внутренняя ошибка сервера")
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}

// Groups — GET /api/ref/groups
func (h *UsersHandler) Groups(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, h.store.Groups())
}

// Directions — GET /api/ref/directions
func (h *UsersHandler) Directions(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, h.store.Directions())
}