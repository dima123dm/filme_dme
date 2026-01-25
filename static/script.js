const tg = window.Telegram.WebApp;
tg.expand();

// Переключение вкладок
async function switchTab(cat, btn) {
    document.getElementById('search-ui').style.display = 'none';
    document.getElementById('grid').style.display = 'grid';
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    
    loadGrid(cat);
}

// Загрузка сетки фильмов
async function loadGrid(cat) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Загрузка...</div>';
    
    try {
        const res = await fetch(`/api/${cat}`);
        const data = await res.json();
        grid.innerHTML = '';
        
        if(data.length === 0) {
            grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Список пуст</div>';
            return;
        }

        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'card';
            div.onclick = () => openDetails(item.url, item.title, item.poster);
            div.innerHTML = `
                <div class="card-badge">${item.status || 'Фильм'}</div>
                <img src="${item.poster}" loading="lazy">
                <div class="card-content">
                    <div class="card-title">${item.title}</div>
                    <div class="card-sub">HDRezka</div>
                </div>
            `;
            grid.appendChild(div);
        });
    } catch (e) {
        grid.innerHTML = '<div style="grid-column:span 2; text-align:center;">Ошибка соединения</div>';
    }
}

// Открытие деталей
async function openDetails(url, title, poster) {
    const modal = document.getElementById('details');
    modal.classList.add('open');
    
    document.getElementById('det-img').src = poster;
    document.getElementById('det-title').innerText = title;
    
    const list = document.getElementById('det-list');
    list.innerHTML = '<div style="text-align:center; padding:40px; color:#888">Загрузка серий...</div>';

    try {
        const res = await fetch(`/api/details?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        // Если пришел HD постер - обновляем
        if(data.poster) document.getElementById('det-img').src = data.poster;

        list.innerHTML = '';
        if(data.error) {
            list.innerHTML = `<div style="text-align:center; padding:20px;">${data.error}</div>`;
            return;
        }

        // Рендерим сезоны
        Object.keys(data.seasons).forEach(s => {
            const h = document.createElement('div');
            h.className = 'season-title';
            h.innerText = s + ' сезон';
            list.appendChild(h);

            data.seasons[s].forEach(ep => {
                const row = document.createElement('div');
                row.className = `ep-row ${ep.watched ? 'watched' : ''}`;
                row.innerHTML = `
                    <span style="flex:1; padding-right:10px;">${ep.title}</span>
                    <div class="check ${ep.watched ? 'active' : ''}" 
                         onclick="toggle('${ep.global_id}', this)"></div>
                `;
                // Храним ссылку на строку в DOM элементе галочки для удобства
                row.querySelector('.check').rowElement = row; 
                list.appendChild(row);
            });
        });
    } catch(e) {
        list.innerHTML = '<div style="text-align:center; padding:20px;">Ошибка загрузки серий</div>';
    }
}

function closeDetails() {
    document.getElementById('details').classList.remove('open');
}

// Ставим галочку
async function toggle(gid, btn) {
    tg.HapticFeedback.impactOccurred('medium');
    
    const row = btn.rowElement;
    const isActive = btn.classList.contains('active');
    
    // Оптимистичный UI: меняем сразу, не ждем сервера
    if(isActive) {
        btn.classList.remove('active');
        row.classList.remove('watched');
    } else {
        btn.classList.add('active');
        row.classList.add('watched');
    }

    // Шлем на сервер
    await fetch('/api/toggle', {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({global_id: gid})
    });
}

// Поиск
function openSearch(btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('grid').style.display = 'none';
    document.getElementById('search-ui').style.display = 'block';
    document.getElementById('q').focus();
}

let searchTimer;
function doSearch(val) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        if(val.length < 3) return;
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        const list = document.getElementById('search-results');
        list.innerHTML = '';
        
        data.forEach(item => {
            const row = document.createElement('div');
            row.className = 'search-item';
            row.innerHTML = `
                <div style="flex:1; font-weight:500">${item.title}</div>
                <div>
                    <button class="btn-add" onclick="addFav('${item.id}', 'watching')">+ Смотрю</button>
                    <button class="btn-add" style="margin-left:5px; background:#444" onclick="addFav('${item.id}', 'later')">+ Позже</button>
                </div>
            `;
            list.appendChild(row);
        });
    }, 500);
}

async function addFav(id, cat) {
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/add', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({post_id:id, category:cat})
    });
    alert('Добавлено в избранное!');
}

// Старт
loadGrid('watching');