/**
 * theme.js — самый первый скрипт страницы. Подключён в <head>, ещё до стилей и отрисовки.
 *
 * Он делает две вещи, пока страница ещё не нарисована (чтобы ничего не мигало):
 *  1) Тема: берёт светлую или тёмную из localStorage и ставит её на <html>.
 *  2) Вход: если в этой вкладке уже входили (есть токен), ставит на <html> класс logged-in.
 *     Тогда CSS сразу покажет приложение, а не форму входа.
 *     Токен лежит в sessionStorage: он живёт при обновлении страницы,
 *     но пропадает, если вкладку закрыть — тогда снова нужен код доступа.
 *
 * Раньше этот код стоял прямо в index.html внутри <script>. Мы вынесли его в файл,
 * потому что сервер запрещает встроенные скрипты (заголовок Content-Security-Policy
 * в back/main.go) — это защита от XSS.
 */

document.documentElement.dataset.theme = localStorage.getItem('studnet-theme') || 'light';

if (sessionStorage.getItem('studnet-token')) {
  document.documentElement.classList.add('logged-in');
}
