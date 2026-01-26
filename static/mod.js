(function () {
    'use strict';

    // Ваш сервер
    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        // Создаем объект компонента вручную, без наследования от устаревших классов
        var comp = {};

        comp.create = function () {
            // 1. Создаем пустой контейнер для контента
            this.html = $('<div class="items items--vertical"></div>');
            
            // 2. Показываем статус загрузки внутри этого контейнера
            var statusLine = $('<div class="empty__descr">Загрузка списка...</div>');
            this.html.append(statusLine);

            var _this = this;

            // 3. Делаем запрос
            fetch(MY_API_URL + '/api/watching')
                .then(function (response) {
                    if (!response.ok) throw new Error(response.status);
                    return response.json();
                })
                .then(function (json) {
                    // Удаляем надпись "Загрузка..."
                    statusLine.remove();
                    
                    if (json && json.length) {
                        // Если фильмы есть — рисуем их
                        Lampa.Noty.show('Rezka: Загружено ' + json.length + ' шт.');
                        _this.render_list(json);
                    } else {
                        // Если список пуст
                        _this.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                })
                .catch(function (error) {
                    statusLine.text('Ошибка сети: ' + error.message);
                    Lampa.Noty.show('Rezka Error: ' + error.message);
                });

            // Возвращаем контейнер Лампе, чтобы она вставила его на экран
            return this.html;
        };

        comp.render_list = function (items) {
            // Создаем линию с заголовком
            var line = Lampa.Template.get('items_line', { title: 'Сейчас смотрю' });
            var list = line.find('.card-layer');

            items.forEach(function (item) {
                // Создаем карточку
                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: item.title,
                    release_year: '',
                    img: item.poster
                });

                // Если картинка не грузится — ставим заглушку
                card.find('img').on('error', function () {
                    $(this).attr('src', './img/empty.jpg');
                });

                // Обработка клика (Поиск)
                card.on('hover:enter', function () {
                    Lampa.Activity.push({
                        component: 'search',
                        query: item.query || item.title
                    });
                });

                // Добавляем карточку в линию
                list.append(card);
            });

            // Добавляем линию в наш основной контейнер
            this.html.append(line);
        };

        return comp;
    }

    // Регистрация в меню
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
                    type: 'list'
                });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();