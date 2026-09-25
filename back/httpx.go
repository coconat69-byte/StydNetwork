// Пакет httpx — маленькие помощники, чтобы не дублировать одни и те
// же 4 строки (выставить заголовок, закодировать в JSON, обработать
// ошибку) в каждом хендлере.
package httpx

import (
	"encoding/json"
	"log"
	"net/http"
)

// JSON пишет value в тело ответа как JSON с нужным статус-кодом
// и заголовком Content-Type. Используется почти в каждом хендлере:
// вместо ручного json.Marshal + w.Write просто httpx.JSON(w, 200, data).
func JSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if value == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(value); err != nil {
		// Сюда попадаем, только если сама сериализация сломалась —
		// это баг на сервере, а не ошибка клиента, поэтому просто логируем.
		log.Printf("httpx: ошибка кодирования JSON: %v", err)
	}
}

// Error — единый формат ошибки, который ждёт фронтенд:
// { "error": "текст ошибки" }
func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, map[string]string{"error": message})
}

// DecodeJSON читает и разбирает JSON-тело запроса в dst (указатель).
// Возвращает false и уже отправляет клиенту 400, если тело битое —
// хендлеру в этом случае достаточно сделать `return`.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		Error(w, http.StatusBadRequest, "Некорректное тело запроса: "+err.Error())
		return false
	}
	return true
}