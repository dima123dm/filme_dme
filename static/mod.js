(function () {
    'use strict';

    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            // Используем стандартный список для правильной работы скролла
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
                .catch(function (e) {
                    statusLine.text('Ошибка: ' + e.message);
                });

            return this.render();
        };

        comp.start = function() {};
        comp.pause = function() {};
        comp.destroy = function() { this.html.remove(); };
        comp.render = function() { return this.html; };

        comp.render_grid = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю (' + items.length + ')</div>');
            
            var body = $('<div class="category-full__body"></div>');
            body.css({
                'display': 'flex',
                'flex-wrap': 'wrap',
                'padding-bottom': '2em'
            });

            items.forEach(function (item) {
                // --- 1. ПРАВИЛЬНАЯ ОЧИСТКА ДЛЯ ПОИСКА ---
                // Твои логи показали, что Лампа ищет "черное зеркало". 
                // Значит, нам нужно убрать все лишнее.
                
                var cleanTitle = item.title;
                
                // 1. Убираем английскую часть (всё после " / ")
                if (cleanTitle.indexOf(' / ') > 0) {
                    cleanTitle = cleanTitle.split(' / ')[0];
                }
                // 2. Убираем год в скобках (2025)
                cleanTitle = cleanTitle.replace(/\(\d{4}\)/g, '');
                // 3. Убираем всё после двоеточия (для "911: Нашвилл" -> "911")
                //    Но если это просто "Мстители: Финал", то двоеточие может быть нужно.
                //    Попробуем сначала отрезать, так поиск надежнее.
                cleanTitle = cleanTitle.split(':')[0];
                
                // 4. Убираем лишние пробелы по краям
                cleanTitle = cleanTitle.trim();

                // --- 2. КАРТИНКИ (ОБХОД КЭША) ---
                var imgUrl = item.poster;
                if (imgUrl && imgUrl.startsWith('http')) {
                    // Добавляем rnd, чтобы браузер не брал старую битую картинку
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(imgUrl) + '&rnd=' + Math.random();
                } else {
                    imgUrl = './img/empty.jpg';
                }

                // --- 3. КАРТОЧКА ---
                var card = Lampa.Template.get('card', {
                    title: item.title,       // Показываем полное красивое название
                    original_title: cleanTitle, // В поиск пойдет чистое
                    release_year: item.status || '',
                    img: imgUrl
                });
                
                card.addClass('card--collection');
                card.css('width', '16.6%');

                // Если картинка все равно не грузится
                card.find('img').on('error', function () {
                    $(this).attr('src', './img/empty.jpg');
                });

                // --- 4. КЛИК И ПОИСК ---
                card.on('hover:enter', function () {
                    // Вызываем стандартный поиск Лампы
                    Lampa.Activity.push({
                        component: 'search',
                        query: cleanTitle
                    });
                });

                body.append(card);
            });

            wrapper.append(body);
            this.html.append(wrapper);
            // Восстанавливаем работу пульта и скролла
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
                Lampa.Activity.push({ component: 'my_rezka', type: 'component' });
            });
            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();