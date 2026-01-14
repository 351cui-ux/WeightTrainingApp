class DB {
    constructor() {
        this.dbName = 'TrainTrackDB';
    }
    async init() {
        return new Promise(res => {
            const r = indexedDB.open(this.dbName, 2);
            r.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('exercises')) {
                    const s = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
                    s.createIndex('order', 'order');
                }
                if (!db.objectStoreNames.contains('workouts')) {
                    db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
                }
            };
            r.onsuccess = e => { this.db = e.target.result; res(); };
        });
    }
    store(n, m = 'readonly') { return this.db.transaction(n, m).objectStore(n) }
    getAll(n) { return new Promise(r => { const q = this.store(n).getAll(); q.onsuccess = () => r(q.result) }) }
    add(n, d) { this.store(n, 'readwrite').add(d) }
    put(n, d) { this.store(n, 'readwrite').put(d) }
}

class App {
    constructor() {
        this.db = new DB();
        this.cat = 'push';
        this.view = 'record';
        this.init();
    }

    async init() {
        await this.db.init();
        this.bind();
        this.render();
        document.getElementById('currentDate').textContent =
            new Date().toLocaleDateString('ja-JP');
    }

    bind() {
        document.querySelectorAll('.cat-btn,.tab-btn').forEach(b => {
            b.onclick = () => { this.cat = b.dataset.category; this.render(); }
        });
        document.querySelectorAll('.nav-item').forEach(b => {
            b.onclick = () => this.switchView(b.dataset.view)
        });
        document.getElementById('globalAddBtn').onclick = () => this.openSet();
        document.getElementById('addExerciseBtn').onclick = () => this.openEx();
        document.querySelectorAll('.modal-close').forEach(b => b.onclick = () => this.close());
        document.getElementById('btnSaveEx').onclick = () => this.saveEx();
        document.getElementById('btnSaveSet').onclick = () => this.saveSet();
    }

    switchView(v) {
        this.view = v;
        document.querySelectorAll('.view').forEach(e => e.classList.toggle('active', e.id === v + 'View'));
        document.getElementById('globalAddBtn').style.display = v === 'record' ? 'block' : 'none';
        this.render();
    }

    async render() {
        const ex = await this.db.getAll('exercises');
        const wo = await this.db.getAll('workouts');
        const today = new Date().toISOString().slice(0, 10);

        if (this.view === 'record') {
            const grid = document.getElementById('exerciseGrid');
            grid.innerHTML = ex.filter(e => e.category === this.cat)
                .map(e => {
                    const w = wo.find(x => x.exerciseId === e.id && x.date === today);
                    if (!w) return '';
                    return `<div class="exercise-card">${e.name}<br>${w.sets ? w.sets.at(-1).weight + 'kg×' + w.sets.at(-1).reps : w.walkingTime + '分'}</div>`;
                }).join('');
        }

        if (this.view === 'settings') {
            document.getElementById('exerciseManagementList').innerHTML =
                ex.filter(e => e.category === this.cat)
                    .sort((a, b) => a.order - b.order)
                    .map((e, i) => `
          <div class="exercise-card">
            ${e.name}
            <button onclick="app.move(${e.id},-1)">▲</button>
            <button onclick="app.move(${e.id},1)">▼</button>
          </div>`).join('');
        }

        if (this.view === 'analytics') {
            const c = document.getElementById('analyticsList');
            c.innerHTML = '';
            ex.forEach(e => {
                const data = wo.filter(w => w.exerciseId === e.id)
                    .reduce((m, w) => { m[w.date] = w; return m }, {});
                const labels = Object.keys(data);
                if (labels.length < 2) return;
                c.innerHTML += `<canvas id="c${e.id}"></canvas>`;
                new Chart(document.getElementById('c' + e.id), {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            data: labels.map(d => data[d].sets ? data[d].sets.at(-1).weight : data[d].walkingTime)
                        }]
                    }
                });
            });
        }
    }

    async openSet() {
        const ex = await this.db.getAll('exercises');
        document.getElementById('selectWorkoutEx').innerHTML =
            ex.filter(e => e.category === this.cat).map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        document.getElementById('inputWorkoutDate').value =
            new Date().toISOString().slice(0, 10);
        this.show('setModal');
    }

    openEx() {
        document.getElementById('inputExName').value = '';
        this.show('exerciseModal');
    }

    show(id) {
        document.getElementById('modalOverlay').classList.add('active');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
    }

    close() { document.getElementById('modalOverlay').classList.remove('active') }

    async saveEx() {
        const name = inputExName.value;
        if (!name) return;
        const ex = await this.db.getAll('exercises');
        this.db.add('exercises', {
            name, category: selectExCategory.value, order: ex.length
        });
        this.close(); this.render();
    }

    async saveSet() {
        const id = +selectWorkoutEx.value;
        const date = inputWorkoutDate.value;
        const sets = [];
        if (w1.value) sets.push({ weight: +w1.value, reps: +r1.value });
        if (w2.value) sets.push({ weight: +w2.value, reps: +r2.value });
        this.db.add('workouts', { exerciseId: id, date, sets });
        this.close(); this.render();
    }

    async move(id, dir) {
        const ex = await this.db.getAll('exercises');
        const i = ex.findIndex(e => e.id === id);
        const t = ex[i + dir];
        if (!t) return;
        [ex[i].order, ex[i + dir].order] = [t.order, ex[i].order];
        this.db.put('exercises', ex[i]);
        this.db.put('exercises', t);
        this.render();
    }
}

window.app = new App();
