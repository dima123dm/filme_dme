(function () {
    'use strict';

    // ВАЖНО: Ваш адрес
    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            this.html = $('<div class="items items--vertical"></div>');
            var statusLine = $('<div class="empty__descr">Загрузка списка...</div>');
            this.html.append(statusLine);

            var _this = this;

            fetch(MY_API_URL + '/api/watching')
                .then(function (response) {
                    if (!response.ok) throw new Error(response.status);
                    return response.json();
                })
                .then(function (json) {
                    statusLine.remove();
                    if (json && json.length) {
                        // Уведомление, чтобы знать, что всё ок
                        Lampa.Noty.show('Rezka: Загружено ' + json.length);
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
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            
            var body = $('<div class="category-full__body"></div>');
            body.css({
                'display': 'flex',
                'flex-wrap': 'wrap',
                'padding-bottom': '2em'
            });

            items.forEach(function (item) {
                // 1. ЧИСТИМ НАЗВАНИЕ ДЛЯ ПОИСКА
                // Берем часть до слеша (если название "Ru / En")
                var cleanTitle = item.title.split('/')[0].trim();
                // Убираем год в скобках, если есть, например "Интерстеллар (2014)" -> "Интерстеллар"
                cleanTitle = cleanTitle.replace(/\(\d{4}\)/, '').trim();

                // 2. ИСПОЛЬЗУЕМ ПРОКСИ ДЛЯ КАРТИНОК
                // Если ссылка есть, гоним её через наш сервер
                var imgUrl = item.poster;
                if (imgUrl && imgUrl.startsWith('http')) {
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(imgUrl);
                }

                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle, // Используем чистое название для оригинального
                    release_year: item.status || '',
                    img: imgUrl
                });
                
                card.addClass('card--collection');
                card.css('width', '16.6%');

                // Если прокси не сработал — заглушка
                card.find('img').on('error', function () {
                    $(this).attr('src', './img/empty.jpg');
                });

                // КЛИК - ПОИСК
                card.on('hover:enter', function () {
                    // Ищем по чистому названию
                    Lampa.Activity.push({
                        component: 'search',
                        query: cleanTitle
                    });
                });

                body.append(card);
            });

            wrapper.append(body);
            this.html.append(wrapper);
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