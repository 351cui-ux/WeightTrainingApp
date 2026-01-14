class DatabaseManager {
    constructor() {
        this.dbName = 'TrainTrackDBv2';
        this.db = null;
    }
    async init() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
                db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
            };
            request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
        });
    }
    async getStore(name, mode = 'readonly') {
        return this.db.transaction(name, mode).objectStore(name);
    }
    async getAll(name) {
        const store = await this.getStore(name);
        return new Promise(r => { const req = store.getAll(); req.onsuccess = () => r(req.result); });
    }
    async add(name, data) {
        const store = await this.getStore(name, 'readwrite');
        return new Promise(r => { const req = store.add(data); req.onsuccess = () => r(req.result); });
    }
    async update(name, data) {
        const store = await this.getStore(name, 'readwrite');
        store.put(data);
    }
    async delete(name, id) {
        const store = await this.getStore(name, 'readwrite');
        store.delete(id);
    }
}

class TrainTrackApp {
    constructor() {
        this.db = new DatabaseManager();
        this.activeCategory = 'push';
        this.activeView = 'record';
        this.init();
    }
    async init() {
        await this.db.init();
        this.bindEvents();
        this.render();
        document.getElementById('currentDate').textContent = new Date().toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' });
    }
    bindEvents() {
        document.querySelectorAll('.nav-item').forEach(b => b.onclick = () => this.switchView(b.dataset.view));
        document.querySelectorAll('.cat-btn, .tab-btn').forEach(b => b.onclick = () => {
            this.activeCategory = b.dataset.category;
            this.render();
        });
        document.getElementById('globalAddBtn').onclick = () => this.openSetModal();
        document.getElementById('addExerciseBtn').onclick = () => this.openExModal();
        document.querySelectorAll('.modal-close').forEach(b => b.onclick = () => this.closeModal());
        document.getElementById('btnSaveEx').onclick = () => this.saveExercise();
        document.getElementById('btnSaveSet').onclick = () => this.saveWorkout();
        document.getElementById('exportCsvBtn').onclick = () => this.exportCSV();
        document.getElementById('importCsvBtnTrigger').onclick = () => document.getElementById('csvImportInput').click();
        document.getElementById('csvImportInput').onchange = (e) => this.importCSV(e);
    }
    switchView(view) {
        this.activeView = view;
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `${view}View`));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
        this.render();
    }
    async render() {
        const exercises = await this.db.getAll('exercises');
        const workouts = await this.db.getAll('workouts');

        // カテゴリボタンの状態同期
        document.querySelectorAll('.cat-btn, .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.category === this.activeCategory));

        if (this.activeView === 'record') {
            const grid = document.getElementById('exerciseGrid');
            grid.innerHTML = exercises.filter(e => e.category === this.activeCategory).map(ex => {
                const history = workouts.filter(w => w.exerciseId === ex.id).sort((a,b) => new Date(b.date) - new Date(a.date));
                const last = history[0];
                const stats = last ? (ex.category === 'walking' ? `${last.walkingTime}分` : `${last.sets[0].weight}kg×${last.sets[0].reps}`) : '記録なし';
                return `<div class="exercise-card" onclick="app.openSetModal(${ex.id})"><strong>${ex.name}</strong><br><small style="color:var(--text-muted)">前回: ${stats}</small></div>`;
            }).join('');
        }
        if (this.activeView === 'settings') {
            document.getElementById('exerciseManagementList').innerHTML = exercises.filter(e => e.category === this.activeCategory).map(ex => `
                <div class="exercise-card" style="display:flex; justify-content:space-between">
                    <span>${ex.name}</span>
                    <button onclick="app.deleteExercise(${ex.id})" style="background:none; border:none; color:#ef4444">削除</button>
                </div>
            `).join('');
        }
        if (this.activeView === 'history') {
            const list = document.getElementById('historyList');
            const sortedWorkouts = workouts.sort((a,b) => new Date(b.date) - new Date(a.date));
            list.innerHTML = sortedWorkouts.map(w => {
                const ex = exercises.find(e => e.id === w.exerciseId);
                if (!ex) return '';
                return `<div class="exercise-card"><strong>${w.date} - ${ex.name}</strong><br>${ex.category === 'walking' ? w.walkingTime+'分' : w.sets.map(s => s.weight+'kg×'+s.reps).join(' / ')}</div>`;
            }).join('');
        }
        if (this.activeView === 'analytics') this.renderCharts(exercises, workouts);
    }
    renderCharts(exercises, workouts) {
        const container = document.getElementById('analyticsList');
        container.innerHTML = '';
        exercises.forEach(ex => {
            const exWorkouts = workouts.filter(w => w.exerciseId === ex.id).sort((a,b) => new Date(a.date) - new Date(b.date));
            if (exWorkouts.length < 2) return;
            const canvasId = `chart-${ex.id}`;
            container.innerHTML += `<div class="chart-card"><h3>${ex.name}</h3><canvas id="${canvasId}"></canvas></div>`;
            setTimeout(() => {
                new Chart(document.getElementById(canvasId), {
                    type: 'line',
                    data: {
                        labels: exWorkouts.map(w => w.date.slice(5)),
                        datasets: [{ label: 'Weight/Time', data: exWorkouts.map(w => ex.category === 'walking' ? w.walkingTime : w.sets[0].weight), borderColor: '#6366f1', tension: 0.3 }]
                    },
                    options: { plugins: { legend: { display: false } } }
                });
            }, 0);
        });
    }
    openExModal() {
        document.getElementById('modalOverlay').classList.add('active');
        document.getElementById('exerciseModal').classList.remove('hidden');
        document.getElementById('setModal').classList.add('hidden');
    }
    async openSetModal(id = null) {
        const exercises = await this.db.getAll('exercises');
        const select = document.getElementById('selectWorkoutEx');
        select.innerHTML = exercises.map(e => `<option value="${e.id}" ${e.id == id ? 'selected' : ''}>${e.name}</option>`).join('');
        document.getElementById('inputWorkoutDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('modalOverlay').classList.add('active');
        document.getElementById('setModal').classList.remove('hidden');
        document.getElementById('exerciseModal').classList.add('hidden');
        select.onchange = () => {
            const ex = exercises.find(e => e.id == select.value);
            const isWalk = ex.category === 'walking';
            document.getElementById('formSets').classList.toggle('hidden', isWalk);
            document.getElementById('formWalking').classList.toggle('hidden', !isWalk);
        };
        select.onchange();
    }
    closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }
    async saveExercise() {
        const name = document.getElementById('inputExName').value;
        const category = document.getElementById('selectExCategory').value;
        if (name) { await this.db.add('exercises', { name, category }); this.closeModal(); this.render(); }
    }
    async deleteExercise(id) { if (confirm('削除しますか？')) { await this.db.delete('exercises', id); this.render(); } }
    async saveWorkout() {
        const exId = parseInt(document.getElementById('selectWorkoutEx').value);
        const date = document.getElementById('inputWorkoutDate').value;
        const exercises = await this.db.getAll('exercises');
        const ex = exercises.find(e => e.id === exId);
        if (ex.category === 'walking') {
            const walkingTime = document.getElementById('inputWalkTime').value;
            await this.db.add('workouts', { exerciseId: exId, date, walkingTime });
        } else {
            const sets = [];
            for (let i=1; i<=4; i++) {
                const w = document.getElementById('w'+i).value;
                const r = document.getElementById('r'+i).value;
                if (w && r) sets.push({ weight: parseFloat(w), reps: parseInt(r) });
            }
            if (sets.length) await this.db.add('workouts', { exerciseId: exId, date, sets });
        }
        this.closeModal(); this.render(); this.showToast('保存しました');
    }
    showToast(m) {
        const t = document.getElementById('toast');
        t.textContent = m; t.classList.remove('hidden');
        setTimeout(() => t.classList.add('hidden'), 2000);
    }
    exportCSV() { /* CSV出力ロジック */ }
    importCSV(e) { /* CSV入力ロジック */ }
}
window.app = new TrainTrackApp();