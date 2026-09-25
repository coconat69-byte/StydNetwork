// Хендлеры чатов и сообщений. Соответствуют API.getChats / API.getMessages /
// API.sendMessage. Всё, что здесь требует знания "кто спрашивает", берёт
// userID из контекста — его туда кладёт middleware.RequireAuth после
// проверки токена, так что подделать чужой userId через тело запроса
// уже нельзя (в отличие от старого API.sendMessage(chatId, userId, ...),
// где userId просто передавался с фронта и ему нужно было "верить").
package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"studnet-backend/internal/httpx"
	"studnet-backend/internal/middleware"
	"studnet-backend/internal/store"
)

type ChatsHandler struct {
	store *store.Store
}

func NewChatsHandler(s *store.Store) *ChatsHandler {
	return &ChatsHandler{store: s}
}

// List — GET /api/chats
// userID берём из токена авторизации (middleware.RequireAuth), а не
// из query-параметра — иначе один пользователь мог бы посмотреть чаты
// другого, просто подставив чужой ?userId=.
func (h *ChatsHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r)
	chats := h.store.ChatsForUser(userID)
	httpx.JSON(w, http.StatusOK, chats)
}

// Messages — GET /api/chats/{id}/messages
func (h *ChatsHandler) Messages(w http.ResponseWriter, r *http.Request) {
	chatID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "Некорректный id чата")
		return
	}
	messages := h.store.Messages(chatID)
	httpx.JSON(w, http.StatusOK, messages)
}

type sendMessageRequest struct {
	Text string `json:"text"`
}

// SendMessage — POST /api/chats/{id}/messages  { "text": "..." }
//
// В старом api.js фронт сам присылал userId и userRole — серверу
// приходилось им доверять "на слово". Теперь оба берутся из проверенной
// сессии: userID — из токена, а роль — подтягивается из БД (store) по
// этому userID, так что подделать её через JSON-тело запроса нельзя.
func (h *ChatsHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	chatID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "Некорректный id чата")
		return
	}

	var req sendMessageRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.Text == "" {
		httpx.Error(w, http.StatusBadRequest, "Текст сообщения пуст")
		return
	}

	userID, _ := middleware.UserID(r)
	user, err := h.store.UserByID(userID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "Пользователь не найден")
		return
	}

	msg, err := h.store.AddMessage(chatID, userID, req.Text, user.Role)
	if err != nil {
		if errors.Is(err, store.ErrReadOnlyChat) {
			httpx.Error(w, http.StatusForbidden, "Этот чат доступен только для чтения")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "Не удалось отправить сообщение")
		return
	}

	httpx.JSON(w, http.StatusCreated, msg)
}