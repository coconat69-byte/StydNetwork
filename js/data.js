/**
 * data.js — все стартовые данные СтудСети: пользователи, чаты, сообщения, клубы.
 *
 * Этот файл используется в двух местах:
 *  - сайт без сервера берёт данные прямо отсюда (см. LOCAL в js/api.js);
 *  - сервер (папка back) при первом запуске переносит их отсюда в базу SQLite.
 * Поэтому данные нужно менять только здесь.
 *
 * Внутри — обычный JSON (кавычки только двойные, без комментариев),
 * иначе сервер не сможет его прочитать.
 *
 * Что где лежит:
 *  accessCodes  — личный код доступа -> id пользователя
 *                 (123-123-123 — студент, 456-456-456 — админ Ольга Сидорова, 789-789-789 — преподаватель);
 *  groups, directions — списки для фильтров в поиске;
 *  users        — пользователи (role: student или teacher; isAdmin: true — доступ к админ-панели);
 *  chatTypes    — типы чатов (readonly: писать могут только преподаватели);
 *  chats        — чаты; у личных (dm) нет имени: ownerId и userId — двое собеседников;
 *  messages     — id чата -> сообщения;
 *  clubs        — клубы (memberIds — id участников);
 *  clubMessages — id клуба -> сообщения чата клуба;
 *  reports      — жалобы на пользователей (видит администратор в разделе «Модерация»).
 */

const MOCK_DATA = {
  "accessCodes": {"123-123-123":1,"456-456-456":7,"789-789-789":6},
  "groups": ["исп341","исп342","исп343","ат231","ат232","э1031","э1032","тм241","др351"],
  "directions": [
    "Информационные системы и программирование",
    "Автомобили и автомобильное хозяйство",
    "Экономика и бухгалтерский учёт",
    "Технология транспортных процессов",
    "Дорожное строительство и эксплуатация автомобильных дорог"
  ],
  "users": [
    {
      "id": 1,
      "name": "Яша Кузнецов",
      "email": "yasha.kuznetsov@oatk.ru",
      "avatar": "images/YASHA_KYZHECOV.avif",
      "group": "ИСП361",
      "direction": "Информационные системы и программирование",
      "course": 1,
      "interests": ["Python","Веб-разработка","Java"],
      "online": true,
      "role": "student",
      "bio": "Первый курс ИСиП. Пишу на Python, Java, верстаю лендинги и иногда помогаю одногруппникам с лабами."
    },
    {
      id: 2,
      name: 'Игорь Ефремов',
      email: 'wraphWFXbetter@oatk.ru',
      avatar: 'images/IgorAvatar.jpg',
      group: 'ИСП341',
      direction: 'Информационные системы и программирование',
      course: 3,
      interests: ['Дизайн', 'Кодинг', 'Автомеханика'],
      online: true,
      role: 'student',
      bio: 'Учусь на ИСиП, третий курс. Занимаюсь дизайном, кодингом и кручу гаечки в гараже.',
    },
    {
      "id": 3,
      "name": "Матвей Беляев",
      "email": "imavano@oatk.ru",
      "avatar": "images/MatthewAvatar.png",
      "group": "ИСП341",
      "direction": "Информационные системы и программирование",
      "course": 3,
      "interests": ["Пастинг","1С","Майнкрафт"],
      "online": true,
      "role": "student",
      "bio": "ИСиП, третий курс. Люблю быстрый прототип в коде и классические жигули — в гараже ВАЗ 2107. Также люблю пастинг и майнкрафт."
    },
    {
      "id": 4,
      "name": "Кирилл Воркисов",
      "email": "vorkis@oatk.ru",
      "avatar": "images/VorkisAvatar.jpg",
      "group": "АТ231",
      "direction": "Автомобили и автомобильное хозяйство",
      "course": 2,
      "interests": ["Моторы","Ремонт","Футбол"],
      "online": false,
      "role": "student",
      "bio": "Учусь на АТ, второй курс. Разбираюсь в двигателях и ремонте, после пар часто в мастерской."
    },
    {
      "id": 5,
      "name": "Антон Хехорович",
      "email": "hehora@oatk.ru",
      "avatar": "images/AntonAvatar.png",
      "group": "ИСП342",
      "direction": "Информационные системы и программирование",
      "course": 3,
      "interests": ["Кошки","Боты","IRC"],
      "online": false,
      "role": "student",
      "bio": "Третий курс ИСП342. Сижу в IRC, пишу ботов и иногда пропадаю из чатов на неделю."
    },
    {
      "id": 6,
      "name": "Артем Досиксов",
      "email": "dsx1337@oatk.ru",
      "avatar": "images/ArtemAvatar.jpg",
      "group": "—",
      "direction": "Главный по приютам для кошечек",
      "course": 0,
      "interests": ["Кошки","Приюты","Тесты"],
      "online": false,
      "role": "teacher",
      "bio": "Преподаватель. Веду практику и тестирование, в свободное время помогаю приютам для животных."
    },
    {
      "id": 7,
      "name": "Ольга Сидорова",
      "email": "OlgaSidorova@oatk.ru",
      "avatar": "images/AnyaPrepor.jpg",
      "group": "",
      "direction": "Информационные системы и программирование",
      "course": 3,
      "interests": ["Android","iOS","Курсовые"],
      "online": false,
      "role": "teacher",
      "isAdmin": true,
      "bio": "Преподаватель ИСиП. Мобильная разработка: Android и iOS, курсовые и учебные проекты."
    },
    {
      "id": 8,
      "name": "Александр Потапов",
      "email": "AlexanderPotapov@oatk.ru",
      "avatar": "images/AlexanderPotapov.jpg",
      "group": "АТ231",
      "direction": "Автомобили и автомобильное хозяйство",
      "course": 2,
      "interests": ["Авто","Шины","Дороги"],
      "online": false,
      "role": "student",
      "bio": "АТ231, второй курс. Автомобили, покрышки и дорога — после колледжа хочу в сервис."
    },
    {
      "id": 9,
      "name": "Полина Калашникова",
      "email": "PolinaKalashnikova@oatk.ru",
      "avatar": "images/PolinaAvatar.jpg",
      "group": "ИСП341",
      "direction": "Информационные системы и программирование",
      "course": 3,
      "interests": ["iOS","Android","Код"],
      "online": false,
      "role": "student",
      "bio": "ИСиП, третий курс. Собираю учебные приложения под iOS и Android."
    },
    {
      "id": 10,
      "name": "Денис Голубев",
      "email": "DenisGolubev@oatk.ru",
      "avatar": "images/DenisAvatar.jpg",
      "group": "Э1031",
      "direction": "Экономика и бухгалтерский учёт",
      "course": 1,
      "interests": ["Экономика","Учёт","Excel"],
      "online": false,
      "role": "student",
      "bio": "Э1031, первый курс. Экономика и бухучёт, веду конспекты и считаю задачи к парам."
    },
    {
      "id": 11,
      "name": "Алексей Федоров",
      "email": "AlexeyFedorov@oatk.ru",
      "avatar": "images/AlexeyAvatar.jpg",
      "group": "ТМ241",
      "direction": "Технология транспортных процессов",
      "course": 2,
      "interests": ["Логистика","Спорт","Авто"],
      "online": false,
      "role": "student",
      "bio": "ТМ241, второй курс. Логистика и транспорт, после пар — спортзал."
    },
    {
      "id": 12,
      "name": "Дмитрий Березин",
      "email": "DmitriyBerezin@oatk.ru",
      "avatar": "images/DmitriyAvatar.jpg",
      "group": "ДР351",
      "direction": "Дорожное строительство и эксплуатация автомобильных дорог",
      "course": 3,
      "interests": ["Дороги","Сметы","Спорт"],
      "online": false,
      "role": "student",
      "bio": "ДР351, третий курс. Дорожное строительство, сметы и практика на объектах."
    },
    {
      "id": 13,
      "name": "Мария Козлова",
      "email": "MariaKozlova@oatk.ru",
      "avatar": "images/MariaAvatar.jpg",
      "group": "ИСП343",
      "direction": "Информационные системы и программирование",
      "course": 3,
      "interests": ["Код","UI","Спорт"],
      "online": true,
      "role": "student",
      "bio": "ИСиП, третий курс. Верстка, интерфейсы и оформление учебных проектов."
    },
    {
      "id": 14,
      "name": "Евгений Козлов",
      "email": "EvgeniyKozlov@oatk.ru",
      "avatar": "images/EvgeniyAvatar.jpg",
      "group": "Э1032",
      "direction": "Экономика и бухгалтерский учёт",
      "course": 1,
      "interests": ["Учёт","Excel","1С"],
      "online": false,
      "role": "student",
      "bio": "Э1032, первый курс. Бухучёт и отчётность, хочу в дальнейшем работать в бухгалтерии."
    },
    {
      "id": 15,
      "name": "Дмитрий Сафронов",
      "email": "DmitriySafronov@oatk.ru",
      "avatar": "images/DmitriySafronov.jpg",
      "group": "ТМ241",
      "direction": "Технология транспортных процессов",
      "course": 2,
      "interests": ["Рейсы","Логистика","Спорт"],
      "online": false,
      "role": "student",
      "bio": "ТМ241, второй курс. Организация перевозок и расписание маршрутов."
    },
    {
      "id": 16,
      "name": "Елена Павлова",
      "email": "ElenaPavlova@oatk.ru",
      "avatar": "images/ElenaAvatar.jpg",
      "group": "ИСП341",
      "direction": "Информационные системы и программирование",
      "course": 3,
      "interests": ["Код","Figma","Спорт"],
      "online": false,
      "role": "student",
      "bio": "Третий курс ИСП341. Дизайн интерфейсов и вёрстка, иногда помогаю с макетами для группы."
    },
    {
      "id": 17,
      "name": "Ирина Иванова",
      "email": "IrinaIvanova@oatk.ru",
      "avatar": "images/IrinaAvatar.jpg",
      "group": "ИСП342",
      "direction": "Информационные системы и программирование",
      "course": 3,
      "interests": ["Код","Дизайн","Спорт"],
      "online": true,
      "role": "student",
      "bio": "ИСиП, третий курс. Люблю сочетать учёбу со спортом и оформлением презентаций."
    },
    {
      "id": 18,
      "name": "Сергей Петров",
      "email": "SergeyPetrov@oatk.ru",
      "avatar": "images/SergeyAvatar.jpg",
      "group": "АТ231",
      "direction": "Автомобили и автомобильное хозяйство",
      "course": 2,
      "interests": ["Авто","Шины","Сервис"],
      "online": false,
      "role": "student",
      "bio": "Второй курс АТ. Диагностика, шиномонтаж и устройство автомобиля."
    },
    {
      "id": 19,
      "name": "Ольга Сидорова",
      "email": "OlgaSidorova@oatk.ru",
      "avatar": "images/OlgaAvatar.jpg",
      "group": "ИСП343",
      "direction": "Информационные системы и программирование",
      "course": 3,
      "interests": ["SQL","Код","Диплом"],
      "online": false,
      "role": "student",
      "bio": "ИСП343, третий курс. Базы данных и курсовые, готовлюсь к диплому."
    },
    {
      "id": 20,
      "name": "Иван Иванов",
      "email": "IvanIvanov@oatk.ru",
      "avatar": "images/IvanAvatar.jpg",
      "group": "Э1031",
      "direction": "Экономика и бухгалтерский учёт",
      "course": 1,
      "interests": ["Учёт","1С","Excel"],
      "online": true,
      "role": "student",
      "bio": "Первый курс экономики. Учу проводки и пока разбираюсь в 1С."
    }
  ],
  "chatTypes": {
    "channel": {"label":"Канал","readonly":true},
    "group": {"label":"Группа","readonly":false},
    "direction": {"label":"Направление","readonly":false},
    "course": {"label":"Курс","readonly":false},
    "flood": {"label":"Флудилка","readonly":false},
    "dm": {"label":"ЛС","readonly":false}
  },
  "chats": [
    {
      "id": 1,
      "name": "Объявления ОАТК",
      "type": "channel",
      "avatar": null,
      "icon": "📢",
      "members": 980,
      "description": "Официальные объявления колледжа. Писать могут только преподаватели и администрация.",
      "lastMessage": "Расписание занятий на следующую неделю опубликовано",
      "lastTime": "09:00"
    },
    {
      "id": 2,
      "name": "исп341",
      "type": "group",
      "avatar": null,
      "icon": "👥",
      "members": 25,
      "description": "Чат группы исп341. Пары, дедлайны, совместные проекты.",
      "lastMessage": "Матвей: Дедлайн на пятницу до 23:59. Я не успеваю, помоги пж!!!",
      "lastTime": "11:50"
    },
    {
      "id": 3,
      "name": "ИСиП — направление",
      "type": "direction",
      "avatar": null,
      "icon": "🎓",
      "members": 124,
      "description": "Общий чат направления «Информационные системы и программирование».",
      "lastMessage": "Ольга: Материалы к занятию выложены",
      "lastTime": "09:20"
    },
    {
      "id": 4,
      "name": "1 курс",
      "type": "course",
      "avatar": null,
      "icon": "📚",
      "members": 280,
      "description": "Чат всех студентов 1 курса ОАТК.",
      "lastMessage": "Может тогда в доту поиграем?",
      "lastTime": "11:52"
    },
    {
      "id": 5,
      "name": "Флудилка ОАТК",
      "type": "flood",
      "avatar": null,
      "icon": "💬",
      "members": 650,
      "description": "Свободное общение на любые темы.",
      "lastMessage": "Кирилл: Ещё нет, жду выходных",
      "lastTime": "12:03"
    },
    {
      "id": 6,
      "type": "dm",
      "ownerId": 1,
      "userId": 2,
      "icon": null,
      "members": 2,
      "description": "Личная переписка",
      "lastMessage": "Привет, как там Матвейка? Сделал лабу по HTML? Мб помогу вам щяс.",
      "lastTime": "12:00"
    },
    {
      "id": 7,
      "type": "dm",
      "ownerId": 1,
      "userId": 3,
      "icon": null,
      "members": 2,
      "description": "Личная переписка",
      "lastMessage": "Ну лан,я уже сам нашел решение",
      "lastTime": "11:55"
    }
  ],
  "messages": {
    "1": [
      {
        "id": 101,
        "userId": 7,
        "text": "Уважаемые студенты! Расписание на следующую неделю опубликовано на портале ОАТК.",
        "time": "10:30",
        "reactions": [{"emoji":"👍","count":18}]
      },
      {
        "id": 102,
        "userId": 7,
        "text": "15 сентября — день открытых дверей для абитуриентов. Приглашаем!",
        "time": "09:00",
        "reactions": [{"emoji":"👍","count":12}]
      }
    ],
    "2": [
      {"id":201,"userId":2,"text":"Кто сделал лабу по HTML?","time":"11:42","reactions":[]},
      {"id":202,"userId":1,"text":"Я почти доделал, могу помочь с вёрсткой","time":"11:45","reactions":[{"emoji":"🔥","count":2}]},
      {"id":203,"userId":3,"text":"Дедлайн на пятницу до 23:59. Я не успеваю, помоги пж!!!","time":"11:50","reactions":[{"emoji":"😱","count":3}]}
    ],
    "3": [
      {
        "id": 301,
        "userId": 7,
        "text": "Материалы к занятию по программированию выложены в личном кабинете.",
        "time": "09:15",
        "reactions": [{"emoji":"👍","count":8}]
      },
      {"id":302,"userId":1,"text":"Спасибо!","time":"09:20","reactions":[]}
    ],
    "4": [
      {"id":401,"userId":4,"text":"Всем привет! У кого какие планы на выходные?","time":"11:42","reactions":[]},
      {"id":402,"userId":1,"text":"Я свободен","time":"11:50","reactions":[{"emoji":"🔥","count":2}]},
      {"id":403,"userId":3,"text":"Я думал поиграть в комп","time":"11:51","reactions":[{"emoji":"🔥","count":1}]},
      {"id":404,"userId":4,"text":"Может тогда в доту поиграем?","time":"11:52","reactions":[{"emoji":"👍","count":3}]}
    ],
    "5": [
      {"id":501,"userId":5,"text":"Кто смотрел матч вчера?","time":"12:01","reactions":[{"emoji":"👀","count":5}]},
      {"id":502,"userId":4,"text":"Ещё нет, жду выходных","time":"12:03","reactions":[{"emoji":"😂","count":2}]}
    ],
    "6": [
      {"id":601,"userId":2,"text":"Привет, как там Матвейка? Сделал лабу по HTML? Мб помогу вам щяс","time":"12:00","reactions":[]}
    ],
    "7": [
      {"id":701,"userId":3,"text":"ПОМОГИ МНЕ ПЛЗ!!!","time":"11:50","reactions":[]},
      {"id":702,"userId":1,"text":"Кто вы, Матвей? Я не знаю вас. Не пишите сюда больше.","time":"11:52","reactions":[{"emoji":"👍","count":1}]},
      {"id":703,"userId":3,"text":"Ну лан,я уже сам нашел решение","time":"11:53","reactions":[{"emoji":"👍","count":1}]}
    ]
  },
  "clubs": [
    {
      "id": 1,
      "name": "IT-клуб ОАТК",
      "emoji": "💻",
      "description": "Программирование, веб-разработка и подготовка к олимпиадам.",
      "category": "IT",
      "admin": "Ольга Сидорова",
      "memberIds": [7,1,2,3,5,9,17]
    },
    {
      "id": 2,
      "name": "Автоклуб",
      "emoji": "🚗",
      "description": "Ремонт, диагностика автомобилей, участие в соревнованиях WorldSkills.",
      "category": "Техника",
      "admin": "Кирилл Воркисов",
      "memberIds": [4,8,18,2,3,11]
    },
    {
      "id": 3,
      "name": "Киберспорт",
      "emoji": "🎮",
      "description": "Турниры по CS2, Dota 2 и другим дисциплинам среди студентов колледжа.",
      "category": "Досуг",
      "admin": "Яша Кузнецов",
      "memberIds": [1,3,5,4,20,15]
    },
    {
      "id": 4,
      "name": "Настольные игры",
      "emoji": "🎲",
      "description": "Мафия, Монополия и другие игры каждую пятницу в актовом зале.",
      "category": "Досуг",
      "admin": "Мария Козлова",
      "memberIds": [13,10,14,17,16]
    },
    {
      "id": 5,
      "name": "Клуб дизайна",
      "emoji": "⭐",
      "description": "Создаем фирменные стили, плакаты и цифровые иллюстрации.",
      "category": "Дизайн",
      "admin": "Мария Козлова",
      "memberIds": [13,2,16,17,9]
    },
    {
      "id": 6,
      "name": "Литературный клуб",
      "emoji": "📖",
      "description": "Читаем книги, обсуждаем авторов и литературные жанры.",
      "category": "Книги",
      "admin": "Мария Козлова",
      "memberIds": [13,19,12,10,16]
    },
    {
      "id": 7,
      "name": "Клуб волонтеров",
      "emoji": "❤️",
      "description": "Помогаем городу, проводим акции и волонтерские выезды.",
      "category": "Добро",
      "admin": "Мария Козлова",
      "memberIds": [13,6,9,14,20]
    },
    {
      "id": 8,
      "name": "Клуб робототехники",
      "emoji": "🤖",
      "description": "Собираем роботов, изучаем электронику и микроконтроллеры.",
      "category": "IT",
      "admin": "Мария Козлова",
      "memberIds": [13,1,5,11,7]
    },
    {
      "id": 9,
      "name": "Фотоклуб",
      "emoji": "📸",
      "description": "Учимся снимать, обрабатывать фотографии и создавать фотопроекты.",
      "category": "Фото",
      "admin": "Мария Козлова",
      "memberIds": [13,16,15,8]
    },
    {
      "id": 10,
      "name": "Кулинарный клуб",
      "emoji": "🍭",
      "description": "Готовим блюда, проводим мастер-классы и обмениваемся рецептами.",
      "category": "Еда",
      "admin": "Мария Козлова",
      "memberIds": [13,17,20,14,12,1]
    },
    {
      "id": 11,
      "name": "Танцевальный клуб",
      "emoji": "🎵",
      "description": "Изучаем хореографию и готовим номера к выступлениям.",
      "category": "Танцы",
      "admin": "Мария Козлова",
      "memberIds": [13,9,19,18,16]
    },
    {
      "id": 12,
      "name": "Туристический клуб",
      "emoji": "🌍",
      "description": "Походы, сплавы и поездки на природу по Омской области.",
      "category": "Туризм",
      "admin": "Мария Козлова",
      "memberIds": [13,11,12,15,4]
    }
  ],
  "clubMessages": {
    "1": [
      {"id":1011,"userId":7,"text":"Друзья, в субботу разбираем задачи с прошлой олимпиады. Приходите в 305 кабинет.","time":"10:15","reactions":[]},
      {"id":1012,"userId":1,"text":"Буду! Можно прийти со своим ноутбуком?","time":"10:20","reactions":[]},
      {"id":1013,"userId":7,"text":"Конечно, даже нужно 🙂","time":"10:22","reactions":[]}
    ],
    "2": [
      {"id":1021,"userId":4,"text":"В четверг меняем масло на учебной «семёрке», кто поможет?","time":"14:05","reactions":[]},
      {"id":1022,"userId":8,"text":"Я приду после пар","time":"14:12","reactions":[]},
      {"id":1023,"userId":18,"text":"Тоже буду, возьму ключи на 13","time":"14:15","reactions":[]}
    ],
    "3": [
      {"id":1031,"userId":1,"text":"Набираем состав на турнир по CS2, нужны ещё двое","time":"18:30","reactions":[]},
      {"id":1032,"userId":3,"text":"Я в деле!","time":"18:32","reactions":[]},
      {"id":1033,"userId":20,"text":"Могу пятым, если нужен","time":"18:40","reactions":[]}
    ],
    "4": [
      {"id":1041,"userId":13,"text":"В пятницу играем в «Каркассон» и «Кодовые имена», приносите свои игры","time":"15:00","reactions":[]},
      {"id":1042,"userId":10,"text":"Принесу «Манчкин»","time":"15:10","reactions":[]}
    ],
    "5": [
      {"id":1051,"userId":13,"text":"Новое задание: сделать афишу для дня открытых дверей в Figma","time":"12:00","reactions":[]},
      {"id":1052,"userId":16,"text":"Уже набросала пару вариантов, скину вечером","time":"12:25","reactions":[]},
      {"id":1053,"userId":2,"text":"Я возьму вариант в тёмных тонах","time":"12:40","reactions":[]}
    ],
    "6": [
      {"id":1061,"userId":13,"text":"На этой неделе читаем «Мастера и Маргариту», обсуждаем в среду","time":"16:00","reactions":[]},
      {"id":1062,"userId":19,"text":"Уже на середине, очень нравится","time":"16:20","reactions":[]},
      {"id":1063,"userId":12,"text":"Я только начал 😅","time":"16:45","reactions":[]}
    ],
    "7": [
      {"id":1071,"userId":13,"text":"В воскресенье едем в приют, нужны руки и корм","time":"11:00","reactions":[]},
      {"id":1072,"userId":6,"text":"Отвезу на своей машине, есть 3 места","time":"11:15","reactions":[]},
      {"id":1073,"userId":9,"text":"Я с вами!","time":"11:20","reactions":[]}
    ],
    "8": [
      {"id":1081,"userId":13,"text":"Собираем робота-сумоиста к соревнованиям, нужен кто-то на прошивку","time":"13:30","reactions":[]},
      {"id":1082,"userId":5,"text":"Могу взять Arduino-часть","time":"13:40","reactions":[]},
      {"id":1083,"userId":11,"text":"Помогу с корпусом","time":"13:52","reactions":[]}
    ],
    "9": [
      {"id":1091,"userId":13,"text":"Тема недели — «Осенний Омск». Ждём ваши снимки!","time":"09:30","reactions":[]},
      {"id":1092,"userId":16,"text":"Вчера сняла набережную на закате","time":"10:05","reactions":[]},
      {"id":1093,"userId":15,"text":"Скину пару кадров с моста","time":"10:20","reactions":[]}
    ],
    "10": [
      {"id":1101,"userId":13,"text":"В субботу печём пиццу в столовой, кто с нами?","time":"17:00","reactions":[]},
      {"id":1102,"userId":17,"text":"Я! Принесу сыр","time":"17:10","reactions":[]},
      {"id":1103,"userId":20,"text":"А ананас в пиццу можно? 🍍","time":"17:12","reactions":[]}
    ],
    "11": [
      {"id":1111,"userId":13,"text":"Репетиция к концерту во вторник в актовом зале","time":"19:00","reactions":[]},
      {"id":1112,"userId":9,"text":"Буду, выучила вторую часть","time":"19:15","reactions":[]},
      {"id":1113,"userId":18,"text":"Постараюсь успеть после тренировки","time":"19:30","reactions":[]}
    ],
    "12": [
      {"id":1121,"userId":13,"text":"Планируем поход на выходные, кто идёт — отметьтесь","time":"20:00","reactions":[]},
      {"id":1122,"userId":11,"text":"Я иду, возьму палатку","time":"20:10","reactions":[]},
      {"id":1123,"userId":4,"text":"Тоже иду!","time":"20:25","reactions":[]}
    ]
  },
  "reports": [
    {"id":142,"userId":20,"reason":"Спам в чате «Флудилка»","time":"2 часа назад"},
    {"id":141,"userId":18,"reason":"Оскорбление в личных сообщениях","time":"5 часов назад"}
  ]
};
