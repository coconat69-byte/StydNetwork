// Этот файл — просто перенос содержимого вашего старого data.js
// в Go-структуры. Никакой логики здесь нет, только данные.
package store

import "studnet-backend/internal/models"

func seedUsers() []models.User {
	return []models.User{
		{ID: 1, Name: "Яша Кузнецов", Email: "yasha.kuznetsov@oatk.ru", Avatar: "images/YASHA_KYZHECOV.avif", Group: "ИСП361", Direction: "Информационные системы и программирование", Course: 1, Interests: []string{"Python", "Веб-разработка", "Java"}, Online: true, Role: "student", Bio: "Первый курс ИСиП. Пишу на Python, Java, верстаю лендинги и иногда помогаю одногруппникам с лабами."},
		{ID: 2, Name: "Игорь Ефремов", Email: "wraphWFXbetter@oatk.ru", Avatar: "images/IgorAvatar.jpg", Group: "ИСП341", Direction: "Информационные системы и программирование", Course: 31, Interests: []string{"Дизайн", "Кодинг", "Автомеханика"}, Online: true, Role: "student", Bio: "Учусь на ИСиП, третий курс. Занимаюсь дизайном, кодингом и кручу гаечки в гараже."},
		{ID: 3, Name: "Матвей Беляев", Email: "imavano@oatk.ru", Avatar: "images/MatthewAvatar.png", Group: "ИСП341", Direction: "Информационные системы и программирование", Course: 3, Interests: []string{"Пастинг", "1С", "Майнкрафт"}, Online: true, Role: "student", Bio: "ИСиП, третий курс. Люблю быстрый прототип в коде и классические жигули — в гараже ВАЗ 2107. Также люблю пастинг и майнкрафт."},
		{ID: 4, Name: "Кирилл Воркисов", Email: "vorkis@oatk.ru", Avatar: "images/VorkisAvatar.jpg", Group: "АТ231", Direction: "Автомобили и автомобильное хозяйство", Course: 2, Interests: []string{"Моторы", "Ремонт", "Футбол"}, Online: false, Role: "student", Bio: "Учусь на АТ, второй курс. Разбираюсь в двигателях и ремонте, после пар часто в мастерской."},
		{ID: 5, Name: "Антон Хехорович", Email: "hehora@oatk.ru", Avatar: "images/AntonAvatar.png", Group: "ИСП342", Direction: "Информационные системы и программирование.", Course: 3, Interests: []string{"Кошки", "Боты", "IRC"}, Online: false, Role: "student", Bio: "Третий курс ИСП342. Сижу в IRC, пишу ботов и иногда пропадаю из чатов на неделю."},
		{ID: 6, Name: "Артем Досиксов", Email: "dsx1337@oatk.ru", Avatar: "images/ArtemAvatar.jpg", Group: "—", Direction: "Главный по приютам для кошечек", Course: 0, Interests: []string{"Кошки", "Приюты", "Тесты"}, Online: false, Role: "teacher", Bio: "Преподаватель. Веду практику и тестирование, в свободное время помогаю приютам для животных."},
		{ID: 7, Name: "Ольга Сидорова", Email: "OlgaSidorova@oatk.ru", Avatar: "images/AnyaPrepor.jpg", Group: "", Direction: "Информационные системы и программирование", Course: 3, Interests: []string{""}, Online: false, Role: "teacher", Bio: "Преподаватель ИСиП. Мобильная разработка: Android и iOS, курсовые и учебные проекты."},
		{ID: 8, Name: "Александр Потапов", Email: "AlexanderPotapov@oatk.ru", Avatar: "images/AlexanderPotapov.jpg", Group: "АТ231", Direction: "Автомобили и автомобильное хозяйство", Course: 2, Interests: []string{"Авто", "Шины", "Дороги"}, Online: false, Role: "student", Bio: "АТ231, второй курс. Автомобили, покрышки и дорога — после колледжа хочу в сервис."},
		{ID: 9, Name: "Полина Калашникова", Email: "PolinaKalashnikova@oatk.ru", Avatar: "images/PolinaAvatar.jpg", Group: "ИСП341", Direction: "Информационные системы и программирование", Course: 3, Interests: []string{"iOS", "Android", "Код"}, Online: false, Role: "student", Bio: "ИСиП, третий курс. Собираю учебные приложения под iOS и Android."},
		{ID: 10, Name: "Денис Голубев", Email: "DenisGolubev@oatk.ru", Avatar: "images/DenisAvatar.jpg", Group: "Э1031", Direction: "Экономика и бухгалтерский учёт", Course: 1, Interests: []string{"Экономика", "Учёт", "Excel"}, Online: false, Role: "student", Bio: "Э1031, первый курс. Экономика и бухучёт, веду конспекты и считаю задачи к парам."},
		{ID: 11, Name: "Алексей Федоров", Email: "AlexeyFedorov@oatk.ru", Avatar: "images/AlexeyAvatar.jpg", Group: "ТМ241", Direction: "Технология транспортных процессов", Course: 2, Interests: []string{"Логистика", "Спорт", "Авто"}, Online: false, Role: "student", Bio: "ТМ241, второй курс. Логистика и транспорт, после пар — спортзал."},
		{ID: 12, Name: "Дмитрий Березин", Email: "DmitriyBerezin@oatk.ru", Avatar: "images/DmitriyAvatar.jpg", Group: "ДР351", Direction: "Дорожное строительство и эксплуатация автомобильных дорог", Course: 3, Interests: []string{"Дороги", "Сметы", "Спорт"}, Online: false, Role: "student", Bio: "ДР351, третий курс. Дорожное строительство, сметы и практика на объектах."},
		{ID: 13, Name: "Мария Козлова", Email: "MariaKozlova@oatk.ru", Avatar: "images/MariaAvatar.jpg", Group: "ИСП343", Direction: "Информационные системы и программирование", Course: 3, Interests: []string{"Код", "UI", "Спорт"}, Online: true, Role: "student", Bio: "ИСиП, третий курс. Верстка, интерфейсы и оформление учебных проектов."},
		{ID: 14, Name: "Евгений Козлов", Email: "EvgeniyKozlov@oatk.ru", Avatar: "images/EvgeniyAvatar.jpg", Group: "Э1032", Direction: "Экономика и бухгалтерский учёт", Course: 1, Interests: []string{"Учёт", "Excel", "1С"}, Online: false, Role: "student", Bio: "Э1032, первый курс. Бухучёт и отчётность, хочу в дальнейшем работать в бухгалтерии."},
		{ID: 15, Name: "Дмитрий Сафронов", Email: "DmitriySafronov@oatk.ru", Avatar: "images/DmitriySafronov.jpg", Group: "ТМ241", Direction: "Технология транспортных процессов", Course: 2, Interests: []string{"Рейсы", "Логистика", "Спорт"}, Online: false, Role: "student", Bio: "ТМ241, второй курс. Организация перевозок и расписание маршрутов."},
		{ID: 16, Name: "Елена Павлова", Email: "ElenaPavlova@oatk.ru", Avatar: "images/ElenaAvatar.jpg", Group: "ИСП341", Direction: "Информационные системы и программирование", Course: 3, Interests: []string{"Код", "Figma", "Спорт"}, Online: false, Role: "student", Bio: "Третий курс ИСП341. Дизайн интерфейсов и вёрстка, иногда помогаю с макетами для группы."},
		{ID: 17, Name: "Ирина Иванова", Email: "IrinaIvanova@oatk.ru", Avatar: "images/IrinaAvatar.jpg", Group: "ИСП342", Direction: "Информационные системы и программирование", Course: 3, Interests: []string{"Код", "Дизайн", "Спорт"}, Online: true, Role: "student", Bio: "ИСиП, третий курс. Люблю сочетать учёбу со спортом и оформлением презентаций."},
		{ID: 18, Name: "Сергей Петров", Email: "SergeyPetrov@oatk.ru", Avatar: "images/SergeyAvatar.jpg", Group: "АТ231", Direction: "Автомобили и автомобильное хозяйство", Course: 2, Interests: []string{"Авто", "Шины", "Сервис"}, Online: false, Role: "student", Bio: "Второй курс АТ. Диагностика, шиномонтаж и устройство автомобиля."},
		{ID: 19, Name: "Ольга Сидорова", Email: "OlgaSidorova@oatk.ru", Avatar: "images/OlgaAvatar.jpg", Group: "ИСП343", Direction: "Информационные системы и программирование", Course: 3, Interests: []string{"SQL", "Код", "Диплом"}, Online: false, Role: "student", Bio: "ИСП343, третий курс. Базы данных и курсовые, готовлюсь к диплому."},
		{ID: 20, Name: "Иван Иванов", Email: "IvanIvanov@oatk.ru", Avatar: "images/IvanAvatar.jpg", Group: "Э1031", Direction: "Экономика и бухгалтерский учёт", Course: 1, Interests: []string{"Учёт", "1С", "Excel"}, Online: true, Role: "student", Bio: "Первый курс экономики. Учу проводки и пока разбираюсь в 1С."},
	}
}

func seedChats() []models.Chat {
	return []models.Chat{
		{ID: 1, Name: "Объявления ОАТК", Type: "channel", Icon: "📢", Members: 980, Description: "Официальные объявления колледжа. Писать могут только преподаватели и администрация.", Unread: 2, LastMessage: "Расписание занятий на следующую неделю опубликовано", LastTime: "9:00"},
		{ID: 2, Name: "исп341", Type: "group", Icon: "👥", Members: 25, Description: "Чат группы исп341. Пары, дедлайны, совместные проекты.", Unread: 3, LastMessage: "Матвей: Дедлайн на пятницу до 23:59. Я не успеваю, помоги пж!!!", LastTime: "11:50"},
		{ID: 3, Name: "ИСиП — направление", Type: "direction", Icon: "🎓", Members: 124, Description: "Общий чат направления «Информационные системы и программирование».", Unread: 0, LastMessage: "Ольга: Материалы к занятию выложены", LastTime: "09:20"},
		{ID: 4, Name: "1 курс", Type: "course", Icon: "📚", Members: 280, Description: "Чат всех студентов 1 курса ОАТК.", Unread: 0, LastMessage: "Может тогда в доту поиграем?", LastTime: "11:52"},
		{ID: 5, Name: "Флудилка ОАТК", Type: "flood", Icon: "💬", Members: 650, Description: "Свободное общение на любые темы.", Unread: 2, LastMessage: "Кирилл: Ещё нет, жду выходных", LastTime: "12:03"},
		{ID: 6, Name: "Игорь Ефремов", Type: "dm", Avatar: "images/IgorAvatar.jpg", Members: 2, Description: "Личная переписка", Unread: 1, LastMessage: "Привет, как там Матвейка? Сделал лабу по HTML? Мб помогу вам щяс.", LastTime: "12:00", UserID: 2},
		{ID: 7, Name: "Матвей Беляев", Type: "dm", Avatar: "images/MatthewAvatar.png", Members: 2, Description: "Личная переписка", Unread: 1, LastMessage: "Ну лан,я уже сам нашел решение", LastTime: "11:55", UserID: 3},
	}
}

func seedMessages() map[int][]models.Message {
	return map[int][]models.Message{
		1: {
			{ID: 101, ChatID: 1, UserID: 7, Text: "Уважаемые студенты! Расписание на следующую неделю опубликовано на портале ОАТК.", Time: "10:30", Reactions: []models.Reaction{{Emoji: "👍", Count: 18}}},
			{ID: 102, ChatID: 1, UserID: 7, Text: "15 сентября — день открытых дверей для абитуриентов. Приглашаем!", Time: "09:00", Reactions: []models.Reaction{{Emoji: "👍", Count: 12}}},
		},
		2: {
			{ID: 201, ChatID: 2, UserID: 2, Text: "Кто сделал лабу по HTML?", Time: "11:42", Reactions: []models.Reaction{}},
			{ID: 202, ChatID: 2, UserID: 1, Text: "Я почти доделал, могу помочь с вёрсткой", Time: "11:45", Reactions: []models.Reaction{{Emoji: "🔥", Count: 2}}},
			{ID: 203, ChatID: 2, UserID: 3, Text: "Дедлайн на пятницу до 23:59. Я не успеваю, помоги пж!!!", Time: "11:50", Reactions: []models.Reaction{{Emoji: "😱", Count: 3}}},
		},
		3: {
			{ID: 301, ChatID: 3, UserID: 7, Text: "Материалы к занятию по программированию выложены в личном кабинете.", Time: "09:15", Reactions: []models.Reaction{{Emoji: "👍", Count: 8}}},
			{ID: 302, ChatID: 3, UserID: 1, Text: "Спасибо!", Time: "09:20", Reactions: []models.Reaction{}},
		},
		4: {
			{ID: 401, ChatID: 4, UserID: 4, Text: "Всем привет! У кого какие планы на выходные?", Time: "11:42", Reactions: []models.Reaction{}},
			{ID: 402, ChatID: 4, UserID: 1, Text: "Я свободен", Time: "11:50", Reactions: []models.Reaction{{Emoji: "🔥", Count: 2}}},
			{ID: 403, ChatID: 4, UserID: 3, Text: "Я думал поиграть в комп", Time: "11:51", Reactions: []models.Reaction{{Emoji: "🔥", Count: 1}}},
			{ID: 404, ChatID: 4, UserID: 4, Text: "Может тогда в доту поиграем?", Time: "11:52", Reactions: []models.Reaction{{Emoji: "👍", Count: 3}}},
		},
		5: {
			{ID: 501, ChatID: 5, UserID: 5, Text: "Кто смотрел матч вчера?", Time: "12:01", Reactions: []models.Reaction{{Emoji: "👀", Count: 5}}},
			{ID: 502, ChatID: 5, UserID: 4, Text: "Ещё нет, жду выходных", Time: "12:03", Reactions: []models.Reaction{{Emoji: "😂", Count: 2}}},
		},
		6: {
			{ID: 601, ChatID: 6, UserID: 2, Text: "Привет, как там Матвейка? Сделал лабу по HTML? Мб помогу вам щяс", Time: "12:00", Reactions: []models.Reaction{}},
		},
		7: {
			{ID: 701, ChatID: 7, UserID: 3, Text: "ПОМОГИ МНЕ ПЛЗ!!!", Time: "11:50", Reactions: []models.Reaction{}},
			{ID: 702, ChatID: 7, UserID: 1, Text: "Кто вы, Матвей? Я не знаю вас. Не пишите сюда больше.", Time: "11:52", Reactions: []models.Reaction{{Emoji: "👍", Count: 1}}},
			{ID: 703, ChatID: 7, UserID: 3, Text: "Ну лан,я уже сам нашел решение", Time: "11:53", Reactions: []models.Reaction{{Emoji: "👍", Count: 1}}},
		},
	}
}

func seedClubs() []models.Club {
	return []models.Club{
		{ID: 1, Name: "IT-клуб ОАТК", Emoji: "💻", Description: "Программирование, веб-разработка и подготовка к олимпиадам.", Members: 28, Category: "IT", Joined: true, Admin: "Ольга Сидорова"},
		{ID: 2, Name: "Автоклуб", Emoji: "🚗", Description: "Ремонт, диагностика автомобилей, участие в соревнованиях WorldSkills.", Members: 34, Category: "Техника", Joined: false, Admin: "Кирилл Воркисов"},
		{ID: 3, Name: "Киберспорт", Emoji: "🎮", Description: "Турниры по CS2, Dota 2 и другим дисциплинам среди студентов колледжа.", Members: 45, Category: "Досуг", Joined: true, Admin: "Яша Кузнецов"},
		{ID: 4, Name: "Настольные игры", Emoji: "🎲", Description: "Мафия, Монополия и другие игры каждую пятницу в актовом зале.", Members: 38, Category: "Досуг", Joined: false, Admin: "Мария Козлова"},
		{ID: 5, Name: "Клуб дизайна", Emoji: "⭐", Description: "Создаем фирменные стили, плакаты и цифровые иллюстрации.", Members: 41, Category: "Дизайн", Joined: false, Admin: "Мария Козлова"},
		{ID: 6, Name: "Литературный клуб", Emoji: "📖", Description: "Читаем книги, обсуждаем авторов и литературные жанры.", Members: 26, Category: "Книги", Joined: false, Admin: "Мария Козлова"},
		{ID: 7, Name: "Клуб волонтеров", Emoji: "❤️", Description: "Помогаем городу, проводим акции и волонтерские выезды.", Members: 30, Category: "Добро", Joined: false, Admin: "Мария Козлова"},
		{ID: 8, Name: "Клуб робототехники", Emoji: "🤖", Description: "Собираем роботов, изучаем электронику и микроконтроллеры.", Members: 32, Category: "IT", Joined: false, Admin: "Мария Козлова"},
		{ID: 9, Name: "Фотоклуб", Emoji: "📸", Description: "Учимся снимать, обрабатывать фотографии и создавать фотопроекты.", Members: 24, Category: "Фото", Joined: false, Admin: "Мария Козлова"},
		{ID: 10, Name: "Кулинарный клуб", Emoji: "🍭", Description: "Готовим блюда, проводим мастер-классы и обмениваемся рецептами.", Members: 29, Category: "Еда", Joined: true, Admin: "Мария Козлова"},
		{ID: 11, Name: "Танцевальный клуб", Emoji: "🎵", Description: "Изучаем хореографию и готовим номера к выступлениям.", Members: 36, Category: "Танцы", Joined: false, Admin: "Мария Козлова"},
		{ID: 12, Name: "Туристический клуб", Emoji: "🌍", Description: "Изучаем хореографию и готовим номера к выступлениям.", Members: 27, Category: "Туризм", Joined: false, Admin: "Мария Козлова"},
	}
}