(function () {
    'use strict';

    var MY_API_URL = 'https://filme.64.188.67.85.sslip.io';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка...</div>');
            comp.html.append(loader);

            // Используем jQuery.ajax вместо fetch для лучшей совместимости
            $.ajax({
                url: MY_API_URL + '/api/watching',
                method: 'GET',
                dataType: 'json',
                success: function(items) {
                    loader.remove();
                    if (items && items.length) {
                        comp.renderItems(items);
                    } else {
                        comp.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                    Lampa.Controller.toggle('content');
                },
                error: function(err) {
                    loader.text('Ошибка загрузки: ' + (err.statusText || 'Неизвестная ошибка'));
                    console.error('[Rezka Plugin] Error loading:', err);
                }
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
                console.log('[Rezka Plugin] Processing item:', item);
                
                let title = item.title || '';
                let year = '';
                
                // Извлекаем год из title
                const yearMatch = title.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    title = title.replace(` (${year})`, '');
                }
                
                // Очищаем название (убираем альтернативные названия после /)
                let cleanTitle = title.split(' / ')[0].split(':')[0].trim();

                // Определяем тип контента
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                
                // Формируем URL картинки ВСЕГДА через прокси
                let imgUrl = '';
                if (item.poster && item.poster.length > 0) {
                    // Проверяем, что постер - это валидный URL
                    if (item.poster.startsWith('http://') || item.poster.startsWith('https://')) {
                        imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                    } else {
                        console.warn('[Rezka Plugin] Invalid poster URL:', item.poster);
                        imgUrl = 'https://via.placeholder.com/300x450/333/fff?text=' + encodeURIComponent('No Image');
                    }
                } else {
                    imgUrl = 'https://via.placeholder.com/300x450/333/fff?text=' + encodeURIComponent(cleanTitle);
                }
                
                console.log('[Rezka Plugin] Image URL:', imgUrl);

                // Создаем карточку
                var card = Lampa.Template.get('card', {
                    title: title,
                    original_title: cleanTitle,
                    release_year: item.status || year || '',
                    img: imgUrl
                });

                card.addClass('card--collection');
                card.css({ 
                    width: '16.6%', 
                    minWidth: '140px',
                    cursor: 'pointer'
                });

                // Функция открытия карточки
                function openItem() {
                    console.log('[Rezka Plugin] Opening:', cleanTitle, year, isTv);
                    
                    // Используем ПОИСК вместо прямой ссылки, так как TMDB ID != HDRezka ID
                    Lampa.Activity.push({
                        component: 'search',
                        search: cleanTitle,
                        search_one: cleanTitle,
                        search_two: year,
                        clarification: true
                    });
                }

                // Привязываем события
                card.on('hover:enter', openItem);
                card.on('click', openItem);

                body.append(card);
            });

            wrapper.append(body);
            comp.html.append(wrapper);
        };

        return comp;
    }

    // Регистрация плагина
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            console.log('[Rezka Plugin] Initializing...');
            
            // Добавляем пункт меню если его ещё нет
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
                console.log('[Rezka Plugin] Menu item added');
            }

            // Обработчик клика
            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                console.log('[Rezka Plugin] Menu clicked');
                Lampa.Activity.push({ 
                    component: 'my_rezka',
                    page: 1
                });
            });

            // Регистрируем компонент
            Lampa.Component.add('my_rezka', MyRezkaComponent);
            console.log('[Rezka Plugin] Component registered');
        }
    });
    
    console.log('[Rezka Plugin] Script loaded');
})();