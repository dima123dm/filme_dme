(function () {
    'use strict';

    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            // Используем стандартный вертикальный список Лампы
            this.html = $('<div class="items items--vertical"></div>');
            
            var statusLine = $('<div class="empty__descr">Загрузка...</div>');
            this.html.append(statusLine);

            var _this = this;

            fetch(MY_API_URL + '/api/watching')
                .then(function (response) { return response.json(); })
                .then(function (json) {
                    statusLine.remove();
                    if (json && json.length) {
                        _this.render_grid(json);
                    } else {
                        _this.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                })
                .catch(function (error) {
                    statusLine.text('Ошибка: ' + error.message);
                });

            return this.render();
        };

        comp.start = function() {};
        comp.pause = function() {};
        comp.destroy = function() { this.html.remove(); };
        comp.render = function() { return this.html; };

        comp.render_grid = function (items) {
            // Обертка для сетки
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю (' + items.length + ')</div>');
            
            var body = $('<div class="category-full__body"></div>');
            
            // Стили для правильной плитки
            body.css({
                'display': 'flex',
                'flex-wrap': 'wrap',
                'padding-bottom': '2em'
            });

            items.forEach(function (item) {
                // --- ЛОГИКА ОЧИСТКИ НАЗВАНИЯ ДЛЯ ПОИСКА ---
                // 1. Разбиваем по слешу (/) или двоеточию (:)
                // Пример: "911: Нашвилл" -> "911"
                // Пример: "Интерстеллар / Interstellar" -> "Интерстеллар"
                var cleanTitle = item.title.split(/[:\/]/)[0].trim();
                
                // 2. Убираем год в скобках, если есть "(2025)"
                cleanTitle = cleanTitle.replace(/\(\d{4}\)/, '').trim();

                // --- ПОДГОТОВКА КАРТИНКИ ---
                var imgUrl = item.poster;
                if (imgUrl && imgUrl.startsWith('http')) {
                    // Используем наш серверный прокси
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(imgUrl);
                } else {
                    imgUrl = './img/empty.jpg';
                }

                // --- СОЗДАНИЕ КАРТОЧКИ (Lampa Template) ---
                // Важно использовать Template.get, чтобы работала навигация пультом!
                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle, // Это пойдет в поиск
                    release_year: item.status || '',
                    img: imgUrl
                });
                
                // Добавляем класс для сетки
                card.addClass('card--collection');
                // Размер карточки ( ~6 в ряд)
                card.css('width', '16.6%');

                // Обработка клика
                card.on('hover:enter', function () {
                    // Запускаем поиск по очищенному названию
                    Lampa.Activity.push({
                        component: 'search',
                        query: cleanTitle
                    });
                });

                body.append(card);
            });

            wrapper.append(body);
            this.html.append(wrapper);
            
            // ВАЖНО: Сообщаем контроллеру, что контент готов (для скролла)
            Lampa.Controller.toggle('content');
        };

        return comp;
    }

    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            $('.menu .menu__list').eq(0).append(
                '<li class="menu__item selector" data-action="my_rezka_open">' +
                '<div class="menu__ico">R</div>' +
                '<div class="menu__text">Rezka</div>' +
                '</li>'
            );

            $('body').on('click', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({
                    component: 'my_rezka',
                    type: 'component'
                });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();