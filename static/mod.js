(function () {
    'use strict';

    var MY_API_URL = 'https://filme.64.188.67.85.sslip.io';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка...</div>');
            comp.html.append(loader);

            fetch(MY_API_URL + '/api/watching')
                .then(r => r.json())
                .then(items => {
                    loader.remove();
                    if (items && items.length) {
                        comp.renderItems(items);
                    } else {
                        comp.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                    Lampa.Controller.toggle('content');
                })
                .catch(err => {
                    loader.text('Ошибка загрузки: ' + err.message);
                    console.error(err);
                });

            return comp.html;
        };

        comp.start = function () {
            Lampa.Controller.toggle('content');
        };

        comp.pause = function () {};
        comp.destroy = function () {
            comp.html.remove();
        };

        comp.render = function () {
            return comp.html;
        };

        comp.renderItems = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            var body = $('<div class="category-full__body" style="display:flex;flex-wrap:wrap;gap:12px;padding-bottom:2em"></div>');

            items.forEach(function (item) {
                let title = item.title || '';
                let year = '';
                const yearMatch = title.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    title = title.replace(` (${year})`, '');
                }
                let cleanTitle = title.split(' / ')[0].split(':')[0].trim();

                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');

                // Сначала пробуем прямой постер, при ошибке — через прокси
                let imgUrl = item.poster || '';
                if (!imgUrl.startsWith('http')) imgUrl = 'https://via.placeholder.com/300x450?text=No+image';

                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle,
                    release_year: item.status || year,
                    img: imgUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px' });

                // Если прямой постер не загрузился — пробуем прокси
                card.find('img').on('error', function () {
                    const proxyUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                    $(this).attr('src', proxyUrl);
                });

                // Открытие
                function openItem() {
                    Lampa.Activity.push({
                        component: 'search',
                        query: cleanTitle + (year ? ' ' + year : ''),
                        year: year,
                        type: isTv ? 'tv' : 'movie'
                    });
                }

                card.on('hover:enter', openItem);
                card.on('click', openItem);

                body.append(card);
            });

            wrapper.append(body);
            comp.html.append(wrapper);
        };

        return comp;
    }

    // Регистрация
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico">R</div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }

            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', type: 'component' });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();