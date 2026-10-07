// events.go — мгновенная доставка новых сообщений («долгий опрос», long polling).
//
// Как это работает:
//  1. После входа сайт спрашивает GET /api/events — «что нового?».
//  2. Если нового ничего нет, сервер НЕ отвечает сразу, а ждёт до 25 секунд.
//     Как только кто-то пишет сообщение — сервер тут же отвечает списком событий.
//     Прошло 25 секунд, а событий нет — отвечает пустым списком.
//  3. Получив ответ, сайт сразу задаёт вопрос снова. Так у каждой открытой вкладки
//     почти всегда «висит» вопрос к серверу, и новое сообщение приходит мгновенно.
//
// Почему не «поток» (SSE, WebSocket): ответ, который не заканчивается, по дороге
// могут придержать антивирус (веб-защита), прокси или туннель — и сообщения
// дойдут с большой задержкой или не дойдут вовсе. Ответ долгого опроса — обычный
// законченный JSON, поэтому проходит где угодно.
//
// Чтобы ничего не терялось, у каждого события есть номер (seq). Сайт присылает
// номер последнего события, которое он уже получил (?after=...), и сервер отдаёт
// всё, что было после него — даже если между вопросами прошло несколько секунд.
//
// Права проверяются здесь же: личное сообщение получат только двое собеседников,
// а сообщение из чата группы — только студенты (см. canSeeChat в api.go).
package main

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Сколько сервер ждёт новых событий, прежде чем ответить пустым списком.
// Это дольше общего тайм-аута ответа (10 секунд в main.go), поэтому для /api/events
// тайм-аут продлевается (см. events). Больше 30 секунд лучше не ставить:
// некоторые прокси обрывают запросы, на которые долго нет ответа.
const pollWait = 25 * time.Second

// Сколько последних событий сервер помнит. Если вкладка отстала сильнее
// (например, компьютер «спал»), она просто перечитает всё заново (resync).
const keepEvents = 500

// storedEvent — одно событие: его номер, кому его можно показать и что в нём.
type storedEvent struct {
	seq     int64
	allowed func(user map[string]any) bool // nil — всем
	data    map[string]any
}

var (
	eventsMutex sync.Mutex
	eventLog    []storedEvent             // последние keepEvents событий, по возрастанию seq
	lastSeq     int64                     // номер последнего события
	newEvent    = make(chan struct{})     // закрывается, когда появилось новое событие (и сразу заменяется новым)
	kicked      = map[any]chan struct{}{} // id пользователя -> канал, закрытие которого обрывает его ожидание (disconnect)

	// bootID — «номер запуска» сервера. Входит в курсор, который получает сайт.
	// После перезапуска сервера номера событий начинаются заново, и по bootID сайт
	// поймёт, что старый курсор больше не годится и надо всё перечитать.
	bootID = strconv.FormatInt(time.Now().UnixNano(), 36)
)

// publish запоминает событие и будит все ждущие запросы /api/events.
// allowed решает, кому событие можно показать (nil — всем).
func publish(data map[string]any, allowed func(user map[string]any) bool) {
	eventsMutex.Lock()
	defer eventsMutex.Unlock()

	lastSeq++
	eventLog = append(eventLog, storedEvent{seq: lastSeq, allowed: allowed, data: data})
	if len(eventLog) > keepEvents {
		eventLog = eventLog[len(eventLog)-keepEvents:] // самые старые забываем
	}

	close(newEvent)                // все, кто ждёт на этом канале, проснутся разом
	newEvent = make(chan struct{}) // а следующие будут ждать уже новый канал
}

// disconnect сразу отвечает на все ждущие запросы пользователя (например, после блокировки).
// Следующий запрос уже получит 401 «Требуется вход», потому что его сессии удалены.
func disconnect(userID any) {
	eventsMutex.Lock()
	defer eventsMutex.Unlock()
	if ch, found := kicked[userID]; found {
		close(ch)
		delete(kicked, userID)
	}
}

// cursor — курсор для сайта: «номер запуска сервера-номер события», например «lq3x9k-42».
func cursor(seq int64) string {
	return bootID + "-" + strconv.FormatInt(seq, 10)
}

// parseCursor разбирает курсор от сайта. ok = false, если курсор от другого запуска сервера или испорчен.
func parseCursor(text string) (seq int64, ok bool) {
	boot, number, found := strings.Cut(text, "-")
	if !found || boot != bootID {
		return 0, false
	}
	seq, err := strconv.ParseInt(number, 10, 64)
	if err != nil || seq < 0 || seq > lastSeq {
		return 0, false
	}
	return seq, true
}

// GET /api/events?after=<курсор> — новые события после курсора.
// Отвечает {cursor, events, resync}:
//   - cursor — что прислать в следующий раз;
//   - events — события, которые этому пользователю можно видеть;
//   - resync — true, если курсор не подошёл (сервер перезапускали, вкладка сильно отстала)
//     и сайту надо перечитать чаты целиком.
//
// Без after (самый первый вопрос) сразу отвечает текущим курсором без событий.
func events(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	// У сервера тайм-аут на ответ — 10 секунд (main.go). Этот запрос ждёт дольше, поэтому продлеваем
	rc := http.NewResponseController(w)
	rc.SetReadDeadline(time.Time{})
	rc.SetWriteDeadline(time.Now().Add(pollWait + 10*time.Second))
	w.Header().Set("Cache-Control", "no-store") // ответ нельзя брать из кэша — он каждый раз новый

	after := r.URL.Query().Get("after")
	timeout := time.NewTimer(pollWait)
	defer timeout.Stop()

	for {
		eventsMutex.Lock()
		if after == "" {
			eventsMutex.Unlock()
			return send(w, http.StatusOK, map[string]any{"cursor": cursor(lastSeq), "events": []any{}, "resync": false})
		}
		seq, ok := parseCursor(after)
		oldest := lastSeq - int64(len(eventLog)) // события с номерами <= oldest уже забыты
		if !ok || seq < oldest {
			current := lastSeq
			eventsMutex.Unlock()
			return send(w, http.StatusOK, map[string]any{"cursor": cursor(current), "events": []any{}, "resync": true})
		}

		// Собираем события после seq, которые этому пользователю можно видеть
		found := []any{}
		for _, e := range eventLog {
			if e.seq > seq && (e.allowed == nil || e.allowed(user)) {
				found = append(found, e.data)
			}
		}
		current := lastSeq
		wake := newEvent
		kick := kicked[user["id"]]
		if kick == nil {
			kick = make(chan struct{})
			kicked[user["id"]] = kick
		}
		eventsMutex.Unlock()

		// Есть что отдать — отвечаем сразу
		if len(found) > 0 {
			return send(w, http.StatusOK, map[string]any{"cursor": cursor(current), "events": found, "resync": false})
		}

		// Событий нет (или были, но не для этого пользователя). Ждём, курсор сдвигаем,
		// чтобы чужие события не перебирать заново
		after = cursor(current)
		select {
		case <-wake: // появилось новое событие — идём на новый круг и смотрим, наше ли оно
		case <-timeout.C:
			return send(w, http.StatusOK, map[string]any{"cursor": after, "events": []any{}, "resync": false})
		case <-kick: // пользователя заблокировали
			return send(w, http.StatusOK, map[string]any{"cursor": after, "events": []any{}, "resync": false})
		case <-r.Context().Done(): // вкладку закрыли или обновили — отвечать некому
			return nil
		}
	}
}
