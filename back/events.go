// events.go — мгновенная доставка новых сообщений (Server-Sent Events).
//
// Как это работает:
//  1. После входа сайт открывает запрос GET /api/events и НЕ закрывает его.
//  2. Сервер держит этот ответ открытым и, когда кто-то пишет сообщение,
//     дописывает в него строку «data: {...}» — браузер получает её сразу же.
//  3. Если связь оборвалась (перезапуск сервера, пропал интернет), сайт сам
//     подключается заново через несколько секунд.
//
// Так новые сообщения появляются без обновления страницы.
// Права проверяются здесь же: личное сообщение получат только двое собеседников,
// а сообщение из чата группы — только студенты (см. canSeeChat в api.go).
package main

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// Раз в 25 секунд шлём пустую строку-«пинг», чтобы соединение не закрылось
// из-за долгой тишины (так делают некоторые прокси и браузеры).
const pingInterval = 25 * time.Second

// listener — одна открытая вкладка: кто в ней вошёл и куда ему слать события.
type listener struct {
	user   map[string]any
	events chan []byte
	done   chan struct{} // закрывается, когда соединение нужно оборвать (пользователя заблокировали)
}

var (
	listeners      = map[*listener]bool{} // все открытые вкладки
	listenersMutex sync.Mutex             // запросы обрабатываются одновременно — map защищаем замком
)

// publish отправляет событие всем, кому allowed вернёт true (allowed = nil — всем подряд).
func publish(event map[string]any, allowed func(user map[string]any) bool) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	listenersMutex.Lock()
	defer listenersMutex.Unlock()
	for l := range listeners {
		if allowed != nil && !allowed(l.user) {
			continue
		}
		// Не ждём медленную вкладку: если её очередь переполнена, событие для неё пропускаем.
		// Она всё равно получит его при следующем открытии чата.
		select {
		case l.events <- data:
		default:
		}
	}
}

// disconnect обрывает все потоки событий пользователя (например, после блокировки).
func disconnect(userID any) {
	listenersMutex.Lock()
	defer listenersMutex.Unlock()
	for l := range listeners {
		if l.user["id"] == userID {
			close(l.done)
			delete(listeners, l)
		}
	}
}

// GET /api/events — поток событий для этой вкладки. Ответ не заканчивается, пока вкладка открыта.
func events(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	// У сервера есть тайм-ауты на чтение и ответ (см. main.go). Этому запросу они не нужны:
	// он и должен быть долгим. Снимаем их только для него.
	rc := http.NewResponseController(w)
	rc.SetReadDeadline(time.Time{})
	rc.SetWriteDeadline(time.Time{})

	l := &listener{user: user, events: make(chan []byte, 32), done: make(chan struct{})}
	listenersMutex.Lock()
	listeners[l] = true
	listenersMutex.Unlock()
	defer func() {
		listenersMutex.Lock()
		delete(listeners, l)
		listenersMutex.Unlock()
	}()

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(": connected\n\n")) // строка с «:» — комментарий, сайт её пропускает
	rc.Flush()                         // отправляем сразу, а не когда наберётся побольше

	ping := time.NewTicker(pingInterval)
	defer ping.Stop()

	for {
		select {
		case data := <-l.events:
			w.Write([]byte("data: "))
			w.Write(data)
			w.Write([]byte("\n\n"))
		case <-ping.C:
			w.Write([]byte(": ping\n\n"))
		case <-l.done:
			return nil
		case <-r.Context().Done(): // вкладку закрыли или обновили
			return nil
		}
		if err := rc.Flush(); err != nil {
			return nil // соединение уже оборвано
		}
	}
}
