(function () {
    'use strict';

    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            // 1. Создаем контейнер
            this.html = $('<div class="items items--vertical"></div>');
            
            // 2. Статус загрузки
            var statusLine = $('<div class="empty__descr">Загрузка списка...</div>');
            this.html.append(statusLine);

            var _this = this;

            // 3. Запрос данных
            fetch(MY_API_URL + '/api/watching')
                .then(function (response) {
                    if (!response.ok) throw new Error(response.status);
                    return response.json();
                })
                .then(function (json) {
                    statusLine.remove();
                    
                    if (json && json.length) {
                        // Уведомление об успехе
                        Lampa.Noty.show('Rezka: Найдено ' + json.length + ' шт.');
                        _this.render_list(json);
                    } else {
                        _this.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                })
                .catch(function (error) {
                    statusLine.text('Ошибка: ' + error.message);
                    Lampa.Noty.show('Rezka Error: ' + error.message);
                });

            // Возвращаем результат функции render (которую мы добавили ниже)
            return this.render();
        };

        // ВОТ ЭТОЙ ФУНКЦИИ НЕ ХВАТАЛО
        comp.render = function() {
            return this.html;
        };

        comp.render_list = function (items) {
            var line = Lampa.Template.get('items_line', { title: 'Сейчас смотрю' });
            var list = line.find('.card-layer');

            items.forEach(function (item) {
                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: item.title,
                    release_year: '',
                    img: item.poster
                });

                card.find('img').on('error', function () {
                    $(this).attr('src', './img/empty.jpg');
                });

                card.on('hover:enter', function () {
                    Lampa.Activity.push({
                        component: 'search',
                        query: item.query || item.title
                    });
                });

                list.append(card);
            });

            this.html.append(line);
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
                    type: 'list'
                });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();