(function () {
    'use strict';

    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            this.html = $('<div class="items items--vertical"></div>');
            var statusLine = $('<div class="empty__descr">Загрузка...</div>');
            this.html.append(statusLine);
            var _this = this;

            fetch(MY_API_URL + '/api/watching')
                .then(function (r) { return r.json(); })
                .then(function (json) {
                    statusLine.remove();
                    if (json && json.length) {
                        _this.render_grid(json);
                    } else {
                        _this.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                })
                .catch(function (e) { statusLine.text('Ошибка: ' + e.message); });

            return this.render();
        };

        comp.start = function() {};
        comp.pause = function() {};
        comp.destroy = function() { this.html.remove(); };
        comp.render = function() { return this.html; };

        comp.render_grid = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            var body = $('<div class="category-full__body" style="display:flex; flex-wrap:wrap; padding-bottom:2em"></div>');

            items.forEach(function (item) {
                // --- 1. ОЧИСТКА НАЗВАНИЯ ---
                var cleanTitle = item.title;
                if (cleanTitle.indexOf(' / ') > 0) cleanTitle = cleanTitle.split(' / ')[0];
                cleanTitle = cleanTitle.replace(/\(\d{4}\)/g, '');
                cleanTitle = cleanTitle.split(':')[0]; // "911: Нашвилл" -> "911"
                cleanTitle = cleanTitle.trim();

                // --- 2. КАРТИНКИ ---
                var imgUrl = item.poster;
                if (imgUrl && imgUrl.startsWith('http')) {
                    // Используем наш прокси
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(imgUrl);
                }

                // --- 3. КАРТОЧКА ---
                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle,
                    release_year: item.status || '',
                    img: imgUrl
                });
                card.addClass('card--collection');
                card.css('width', '16.6%');

                card.find('img').on('error', function () { $(this).attr('src', './img/empty.jpg'); });

                // --- 4. КЛИК -> ПОИСК (НАДЕЖНЫЙ МЕТОД) ---
                card.on('hover:enter', function () {
                    // Метод 1: Пробуем стандартный push с page: 1
                    Lampa.Activity.push({
                        component: 'search',
                        query: cleanTitle,
                        page: 1
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
            $('.menu .menu__list').eq(0).append('<li class="menu__item selector" data-action="my_rezka_open"><div class="menu__ico">R</div><div class="menu__text">Rezka</div></li>');
            $('body').on('click', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', type: 'component' });
            });
            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();