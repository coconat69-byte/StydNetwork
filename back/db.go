// db.go — работа с базой данных SQLite.
//
// База — это один файл back/studnet.db. Если файла нет, он создаётся сам:
// таблицы берутся из schema.sql, стартовые данные — из seed.sql.
// Чтобы сбросить базу к начальным данным, удалите studnet.db и перезапустите сервер.
//
// Если вы поменяли schema.sql — увеличьте schemaVersion: при запуске сервер увидит,
// что база старая, и пересоздаст её (все отправленные сообщения при этом сотрутся).
package main

import (
	"database/sql"
	_ "embed" // нужно для //go:embed ниже
	"encoding/json"
	"fmt"
	"log"
	"os"

	_ "modernc.org/sqlite" // драйвер SQLite на чистом Go — не нужны компилятор C и установка СУБД
)

// Содержимое SQL-файлов вшивается прямо в программу при сборке.
//
//go:embed schema.sql
var schemaSQL string

//go:embed seed.sql
var seedSQL string

// schemaVersion — номер версии schema.sql. Хранится в самой базе (PRAGMA user_version).
const schemaVersion = 2

// db — подключение к базе, общее для всего сервера.
var db *sql.DB

// openDB открывает файл базы. Если базы нет или её версия устарела — создаёт заново.
func openDB(path string) {
	connect(path)

	var version int
	db.QueryRow("PRAGMA user_version").Scan(&version) // у нового пустого файла это 0
	if version == schemaVersion {
		return
	}

	if version != 0 {
		log.Println("Схема базы изменилась — создаю базу заново")
	}
	db.Close()
	os.Remove(path)
	connect(path)

	setVersion := fmt.Sprintf("PRAGMA user_version = %d;", schemaVersion)
	if _, err := db.Exec(schemaSQL + seedSQL + setVersion); err != nil {
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

// jsonColumns — колонки, где лежит JSON-текст. Их отдаём браузеру как список, а не строкой.
var jsonColumns = map[string]bool{"interests": true, "reactions": true, "memberIds": true}

// query выполняет SELECT и возвращает строки в виде списка [{колонка: значение}, ...].
// Такой список сразу превращается в JSON для браузера, поэтому отдельные структуры не нужны.
// Имена полей для браузера задаются прямо в SQL через AS (например last_time AS lastTime).
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
