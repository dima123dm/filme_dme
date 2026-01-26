(function () {
    'use strict';

    // Адрес твоего запущенного Python-сервера
    var MY_API_URL = 'http://192.168.1.X:8080'; 

    function MyRezkaComponent(object) {
        var comp = new Lampa.Component(object, {
            name: 'my_rezka',
            genre_id: -1
        });

        comp.create = function () {
            this.activity.loader(true);
            
            // 1. Запрос к твоему Python API
            Lampa.Network.silent(MY_API_URL + '/api/watching', function (json) {
                comp.activity.loader(false);
                
                if (json && json.length) {
                    var items = [];
                    
                    // 2. Преобразуем твои данные в формат Lampa
                    json.forEach(function(item){
                        items.push({
                            title: item.title,
                            original_title: item.title, // Можно добавить английское, если есть
                            img: item.poster,
                            // Важно: передаем название для поиска
                            query: item.title 
                        });
                    });

                    // 3. Рендерим карточки
                    comp.render_list(items);
                } else {
                    comp.empty('Список пуст');
                }
            }, function () {
                comp.activity.loader(false);
                comp.empty('Ошибка подключения к серверу');
            });
            
            return this.render();
        };

        // 4. Обработка клика
        comp.on_click = function (item) {
            // Самый надежный способ интеграции с BWA/Торрентами:
            // Отправляем название сериала в поиск Lampa.
            // Lampa найдет этот фильм через TMDB, и в карточке появятся кнопки "Онлайн" / "Торренты".
            Lampa.Activity.push({
                component: 'search',
                query: item.title
            });
            
            // Если хочется сразу открывать, можно пробовать искать по ID, 
            // но поиск по названию (query) работает стабильнее всего.
        };

        comp.render_list = function (items) {
            var line = Lampa.Template.get('items_line', { title: 'Я смотрю (HDRezka)' });
            var list = line.find('.card-layer');

            items.forEach(function (item) {
                var card = Lampa.Template.get('card', item);
                // Подгоняем размеры картинки под стиль Лампы
                card.find('img').on('error', function(){
                    $(this).attr('src', './img/empty.jpg');
                });
                
                card.on('hover:enter', function () {
                    comp.on_click(item);
                });
                
                list.append(card);
            });

            comp.append(line);
        };

        return comp;
    }

    // Добавляем пункт в меню
    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            var icon = '<svg ...></svg>'; // Тут можно вставить SVG иконку
            
            // Вставляем кнопку в меню
            $('.menu .menu__list').eq(0).append(
                '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico">R</div>' +
                    '<div class="menu__text">Rezka</div>' +
                '</li>'
            );

            $('body').on('click', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({
                    component: 'my_rezka',
                    url: MY_API_URL + '/api/watching',
                    title: 'Моя Резка',
                    page: 1,
                    type: 'list' // или 'component'
                });
            });
            
            // Регистрируем компонент
            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();