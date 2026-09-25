// db.go — работа с базой данных SQLite.
//
// База — это один файл back/studnet.db. Если файла нет, сервер создаёт его сам:
// таблицы берёт из schema.sql, а данные — из js/data.js (того же файла, что сайт
// использует без сервера). Чтобы вернуть базу к стартовым данным, удалите studnet.db.
package main

import (
	"bytes"
	"database/sql"
	_ "embed" // нужно для //go:embed ниже
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	_ "modernc.org/sqlite" // драйвер SQLite на чистом Go — не нужны компилятор C и установка СУБД
)

// Текст schema.sql вшивается прямо в программу при сборке.
//
//go:embed schema.sql
var schemaSQL string

// schemaVersion — версия schema.sql. Хранится в самой базе (PRAGMA user_version).
// Поменяли schema.sql — увеличьте число: сервер увидит старую базу и пересоздаст её.
const schemaVersion = 6

// db — подключение к базе, общее для всего сервера.
var db *sql.DB

// openDB открывает базу. Если её нет или она устарела — создаёт заново.
func openDB(path string) {
	connect(path)

	var version int
	db.QueryRow("PRAGMA user_version").Scan(&version) // у нового пустого файла это 0
	if version == schemaVersion {
		return
	}

	// Старую базу удаляем и создаём с нуля
	db.Close()
	os.Remove(path)
	connect(path)

	if err := createDB(); err != nil {
		db.Close()
		os.Remove(path) // не оставляем недоделанную базу
		log.Fatal("Не удалось создать базу: ", err)
	}
	log.Println("Создана новая база:", path)
}

// connect открывает файл базы (если файла нет, SQLite создаст пустой).
func connect(path string) {
	var err error
	db, err = sql.Open("sqlite", path)
	if err != nil {
		log.Fatal(err)
	}
	// SQLite не любит одновременную запись из нескольких подключений — держим одно
	db.SetMaxOpenConns(1)
}

// createDB создаёт таблицы и заполняет их данными из js/data.js.
func createDB() error {
	if _, err := db.Exec(schemaSQL); err != nil {
		return err
	}

	// В data.js сначала комментарий, а потом «const MOCK_DATA = {...};».
	// Всё от первой { до последней } — обычный JSON, его и читаем.
	raw, err := os.ReadFile(frontDir + "/js/data.js")
	if err != nil {
		return err
	}
	raw = raw[bytes.IndexByte(raw, '{') : bytes.LastIndexByte(raw, '}')+1]

	var data struct {
		AccessCodes  map[string]int
		Groups       []string
		Directions   []string
		Users        []map[string]any
		ChatTypes    map[string]map[string]any
		Chats        []map[string]any
		Messages     map[string][]map[string]any
		Clubs        []map[string]any
		ClubMessages map[string][]map[string]any
		Reports      []map[string]any
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return fmt.Errorf("ошибка в js/data.js: %w", err)
	}

	// Все вставки — одной транзакцией: так в разы быстрее, и при ошибке ничего не запишется
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() // если до Commit не дошли — отменяем всё

	// rows — все строки для вставки: название таблицы + поля строки
	type row struct {
		table  string
		fields map[string]any
	}
	var rows []row
	add := func(table string, fields map[string]any) { rows = append(rows, row{table, fields}) }

	for _, name := range data.Groups {
		add("study_groups", map[string]any{"name": name})
	}
	for _, name := range data.Directions {
		add("directions", map[string]any{"name": name})
	}
	for _, user := range data.Users {
		add("users", user)
	}
	for code, userID := range data.AccessCodes {
		add("access_codes", map[string]any{"code": code, "userId": userID})
	}
	for typ, info := range data.ChatTypes {
		info["type"] = typ
		add("chat_types", info)
	}
	for _, chat := range data.Chats {
		add("chats", chat)
	}
	for chatID, list := range data.Messages {
		for _, msg := range list {
			msg["chatId"] = chatID
			add("messages", msg)
		}
	}
	for _, club := range data.Clubs {
		// Участников храним в отдельной таблице club_members
		for _, userID := range club["memberIds"].([]any) {
			add("club_members", map[string]any{"clubId": club["id"], "userId": userID})
		}
		delete(club, "memberIds")
		add("clubs", club)
	}
	for clubID, list := range data.ClubMessages {
		for _, msg := range list {
			msg["clubId"] = clubID
			delete(msg, "reactions") // у сообщений клубов реакций нет
			add("club_messages", msg)
		}
	}

	for _, report := range data.Reports {
		add("reports", report)
	}

	for _, r := range rows {
		if err := insert(tx, r.table, r.fields); err != nil {
			return fmt.Errorf("%s: %w", r.table, err)
		}
	}

	// Запоминаем версию схемы, чтобы при следующем запуске не пересоздавать базу
	if _, err := tx.Exec(fmt.Sprintf("PRAGMA user_version = %d", schemaVersion)); err != nil {
		return err
	}
	return tx.Commit()
}

// insert добавляет в таблицу строку: имена полей = имена колонок.
// Списки и объекты (интересы, реакции) сохраняются как JSON-текст.
func insert(tx *sql.Tx, table string, fields map[string]any) error {
	var columns, marks []string
	var values []any
	for column, value := range fields {
		switch value.(type) {
		case []any, map[string]any:
			text, _ := json.Marshal(value)
			value = string(text)
		}
		columns = append(columns, `"`+column+`"`)
		marks = append(marks, "?")
		values = append(values, value)
	}
	q := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", table, strings.Join(columns, ", "), strings.Join(marks, ", "))
	_, err := tx.Exec(q, values...)
	return err
}

// jsonColumns — колонки, где лежит JSON-текст. Браузеру отдаём их как списки, а не строкой.
var jsonColumns = map[string]bool{"interests": true, "reactions": true, "memberIds": true}

// query выполняет SELECT и возвращает строки в виде списка [{колонка: значение}, ...].
// Такой список сразу превращается в JSON для браузера, поэтому отдельные структуры не нужны.
func query(q string, args ...any) ([]map[string]any, error) {
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, _ := rows.Columns()
	list := []map[string]any{}
	for rows.Next() {
		// Scan хочет указатели — готовим по одному на каждую колонку
		values := make([]any, len(cols))
		pointers := make([]any, len(cols))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}

		row := map[string]any{}
		for i, col := range cols {
			if text, ok := values[i].(string); ok && jsonColumns[col] {
				row[col] = json.RawMessage(text)
			} else {
				row[col] = values[i]
			}
		}
		list = append(list, row)
	}
	return list, rows.Err()
}

// queryOne — как query, но для одной строки. Если ничего не нашлось, вернёт nil.
func queryOne(q string, args ...any) (map[string]any, error) {
	list, err := query(q, args...)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return list[0], nil
}
