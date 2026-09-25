// Хендлеры админ-панели. Соответствуют API.getAdminStats / API.getAdminUsers.
//
// Важное отличие от старого фронтенд-стаба: там доступ к админке
// регулировался ТОЛЬКО скрытием кнопки в интерфейсе
// ($('#admin-link').hidden = user.role !== 'teacher'), а сам API
// был готов отдать данные кому угодно. Это не защита — просто открыть
// devtools и дёрнуть fetch('/api/admin/stats') мог бы любой студент.
// Здесь же сервер сам проверяет роль и не глядя на фронт отказывает
// в доступе, если запрос пришёл не от преподавателя.
package handlers

import (
	"net/http"

	"studnet-backend/internal/httpx"
	"studnet-backend/internal/middleware"
	"studnet-backend/internal/store"
)

type AdminHandler struct {
	store *store.Store
}

func NewAdminHandler(s *store.Store) *AdminHandler {
	return &AdminHandler{store: s}
}

// requireTeacher — общая проверка для всех admin-эндпоинтов.
// Возвращает false и уже отправляет ответ об ошибке, если доступ запрещён.
func (h *AdminHandler) requireTeacher(w http.ResponseWriter, r *http.Request) bool {
	userID, ok := middleware.UserID(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "Требуется авторизация")
		return false
	}
	user, err := h.store.UserByID(userID)
	if err != nil || user.Role != "teacher" {
		httpx.Error(w, http.StatusForbidden, "Доступ только для преподавателей")
		return false
	}
	return true
}

// Stats — GET /api/admin/stats
func (h *AdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	if !h.requireTeacher(w, r) {
		return
	}
	httpx.JSON(w, http.StatusOK, h.store.AdminStats())
}

// Users — GET /api/admin/users
func (h *AdminHandler) Users(w http.ResponseWriter, r *http.Request) {
	if !h.requireTeacher(w, r) {
		return
	}
	httpx.JSON(w, http.StatusOK, h.store.AllUsers())
}