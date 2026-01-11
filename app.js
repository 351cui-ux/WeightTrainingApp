/**
 * TrainTrack v2.0 - Core Logic
 */

class DatabaseManager {
    constructor() {
        this.dbName = 'TrainTrackDBv2'; // New DB for 2.0 to ensure clean state
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Exercises: id, name, category, order
                const exStore = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
                exStore.createIndex('category', 'category', { unique: false });
                exStore.createIndex('order', 'order', { unique: false });

                // Workouts: id, exerciseId, sets (json), date
                const workoutStore = db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
                workoutStore.createIndex('exerciseId', 'exerciseId', { unique: false });
                workoutStore.createIndex('date', 'date', { unique: false });
            };
        });
    }

    // Generic transaction helper
    async perform(storeName, mode, callback) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = callback(store);
            tx.oncomplete = () => resolve(request ? request.result : null);
            tx.onerror = () => reject(tx.error);
        });
    }

    // Exercises
    async getExercises(category = null) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('exercises', 'readonly');
            const store = tx.objectStore('exercises');
            const index = store.index('order');
            const request = index.getAll();
            request.onsuccess = () => {
                let res = request.result;
                if (category) res = res.filter(e => e.category === category);
                resolve(res);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async addExercise(name, category) {
        const exercises = await this.getExercises();
        const maxOrder = exercises.length > 0 ? Math.max(...exercises.map(e => e.order || 0)) : -1;
        return this.perform('exercises', 'readwrite', store => store.add({ name, category, order: maxOrder + 1 }));
    }

    async updateExercise(exercise) {
        return this.perform('exercises', 'readwrite', store => store.put(exercise));
    }

    async deleteExercise(id) {
        // Delete related workouts too
        const workouts = await this.getWorkouts(id);
        const tx = this.db.transaction(['exercises', 'workouts'], 'readwrite');
        tx.objectStore('exercises').delete(id);
        const wStore = tx.objectStore('workouts');
        workouts.forEach(w => wStore.delete(w.id));
        return new Promise((resolve) => {
            tx.oncomplete = () => resolve();
        });
    }

    async getExerciseById(id) {
        return this.perform('exercises', 'readonly', store => store.get(id));
    }

    // Workouts
    async addWorkout(exerciseId, sets, date) {
        return this.perform('workouts', 'readwrite', store => store.add({ exerciseId, sets, date }));
    }

    async updateWorkout(workout) {
        return this.perform('workouts', 'readwrite', store => store.put(workout));
    }

    async deleteWorkout(id) {
        return this.perform('workouts', 'readwrite', store => store.delete(id));
    }

    async getWorkouts(exerciseId = null) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('workouts', 'readonly');
            const store = tx.objectStore('workouts');
            const request = exerciseId ? store.index('exerciseId').getAll(exerciseId) : store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearAll() {
        return new Promise((resolve) => {
            const tx = this.db.transaction(['exercises', 'workouts'], 'readwrite');
            tx.objectStore('exercises').clear();
            tx.objectStore('workouts').clear();
            tx.oncomplete = () => resolve();
        });
    }
}

class TrainTrackApp {
    constructor() {
        this.db = new DatabaseManager();
        this.currentView = 'record';
        this.currentCategory = 'push';
        this.settingsCategory = 'push';
        this.editingExId = null;
        this.editingWorkoutId = null;
        this.charts = {};

        this.init();
    }

    async init() {
        try {
            await this.db.init();
            this.bindEvents();
            this.updateDateDisplay();
            await this.refreshContent();
            console.log('App: Initialization complete (v2.0)');
        } catch (e) {
            console.error('App: Failed to init', e);
            alert('アプリの読み込みに失敗しました。IndexedDBをリセットして試してください。');
        }
    }

    bindEvents() {
        // Nav Items
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.onclick = () => this.switchView(btn.dataset.view);
        });

        // Category Buttons
        document.querySelectorAll('.cat-btn').forEach(btn => {
            btn.onclick = () => this.switchCategory(btn.dataset.category);
        });

        // Settings Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => this.switchSettingsCategory(btn.dataset.category);
        });

        // FAB
        document.getElementById('globalAddBtn').onclick = () => this.handleFloatAction();

        // Modal Close (Generic)
        document.querySelectorAll('.modal-close, .btn-ghost').forEach(btn => {
            btn.onclick = () => this.closeAllModals();
        });

        // Exercise Form
        document.getElementById('addExerciseBtn').onclick = () => this.openExerciseModal();
        document.getElementById('btnSaveEx').onclick = () => this.saveExercise();

        // Workout Form
        document.getElementById('btnSaveSet').onclick = () => this.saveWorkout();
        document.getElementById('selectWorkoutEx').onchange = (e) => this.toggleWorkoutFormUI(parseInt(e.target.value));

        // Data Management
        document.getElementById('exportCsvBtn').onclick = () => this.exportCsv();
        document.getElementById('importCsvBtnTrigger').onclick = () => document.getElementById('csvImportInput').click();
        document.getElementById('csvImportInput').onchange = (e) => this.importCsv(e.target.files[0]);
        document.getElementById('forceUpdateBtn').onclick = () => this.forceUpdate();
    }

    // View Switchers
    switchView(view) {
        this.currentView = view;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`${view}View`).classList.add('active');

        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

        // Hide FAB in non-record views
        const fab = document.getElementById('globalAddBtn');
        if (fab) fab.classList.toggle('hidden', view !== 'record');

        if (view === 'analytics') this.renderAnalytics();
        if (view === 'settings') this.renderSettingsList();
        if (view === 'record') this.refreshContent();
    }

    switchCategory(cat) {
        this.currentCategory = cat;
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.category === cat));
        this.renderExerciseGrid();
    }

    switchSettingsCategory(cat) {
        this.settingsCategory = cat;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.category === cat));
        this.renderSettingsList();
    }

    // Rendering
    async refreshContent() {
        await this.renderExerciseGrid();
    }

    async renderExerciseGrid() {
        const grid = document.getElementById('exerciseGrid');
        const exercises = await this.db.getExercises(this.currentCategory);

        if (exercises.length === 0) {
            grid.innerHTML = `<div class="empty-state"><h3>種目がありません</h3><p>設定から登録してください</p></div>`;
            return;
        }

        grid.innerHTML = '';
        for (const ex of exercises) {
            const card = document.createElement('div');
            card.className = 'exercise-card';
            card.onclick = () => this.openWorkoutModal(null, ex.id);

            const stats = await this.getExerciseStats(ex.id);
            const isWalking = ex.category === 'walking';

            card.innerHTML = `
                <div class="exercise-header">
                    <div class="exercise-name">${ex.name}</div>
                </div>
                <div class="exercise-stats">
                    <div class="stat">
                        <div class="stat-label">前回</div>
                        <div class="stat-value">${stats.last || '-'}</div>
                    </div>
                    ${!isWalking ? `
                    <div class="stat">
                        <div class="stat-label">最終回数</div>
                        <div class="stat-value">${stats.finalReps || '-'}</div>
                    </div>` : ''}
                </div>
            `;
            grid.appendChild(card);
        }
    }

    async getExerciseStats(exId) {
        const workouts = await this.db.getWorkouts(exId);
        if (workouts.length === 0) return { last: null, finalReps: null };

        workouts.sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = workouts[0];

        const exercise = await this.db.getExerciseById(exId);
        if (exercise.category === 'walking') {
            return { last: `${latest.sets[0].reps}分`, finalReps: null };
        } else {
            // Last weight of latest workout
            let lastW = null;
            for (let i = latest.sets.length - 1; i >= 0; i--) {
                if (latest.sets[i].weight > 0) { lastW = `${latest.sets[i].weight}kg`; break; }
            }
            // Reps of the very last set (typically 4th)
            const lastSet = latest.sets[latest.sets.length - 1];
            const finalR = lastSet && lastSet.reps ? `${lastSet.reps}回` : null;

            return { last: lastW, finalReps: finalR };
        }
    }

    async renderSettingsList() {
        const list = document.getElementById('exerciseManagementList');
        const exercises = await this.db.getExercises(this.settingsCategory);
        list.innerHTML = exercises.length === 0 ? '<p style="text-align:center;color:var(--text-muted)">データなし</p>' : '';

        exercises.forEach((ex, idx) => {
            const item = document.createElement('div');
            item.className = 'exercise-item';
            item.innerHTML = `
                <div class="exercise-item-name">${ex.name}</div>
                <div class="exercise-item-actions">
                    <div class="reorder-btns">
                        <button class="icon-btn-small" ${idx === 0 ? 'disabled' : ''}>↑</button>
                        <button class="icon-btn-small" ${idx === exercises.length - 1 ? 'disabled' : ''}>↓</button>
                    </div>
                    <button class="icon-btn edit">✏️</button>
                    <button class="icon-btn delete">🗑️</button>
                </div>
            `;

            const btns = item.querySelectorAll('button');
            btns[0].onclick = () => this.moveEx(ex.id, -1);
            btns[1].onclick = () => this.moveEx(ex.id, 1);
            btns[2].onclick = () => this.openExerciseModal(ex.id);
            btns[3].onclick = () => this.deleteEx(ex.id);

            list.appendChild(item);
        });
    }

    async renderAnalytics() {
        const list = document.getElementById('analyticsList');
        const exercises = await this.db.getExercises();
        list.innerHTML = '';

        for (const ex of exercises) {
            const workouts = await this.db.getWorkouts(ex.id);
            if (workouts.length < 2) continue;

            workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
            const card = document.createElement('div');
            card.className = 'chart-card';
            card.innerHTML = `<h4>${ex.name}</h4><div class="chart-container"><canvas id="chart-${ex.id}"></canvas></div>`;
            list.appendChild(card);

            this.createChart(ex, workouts);
        }
    }

    createChart(ex, workouts) {
        const ctx = document.getElementById(`chart-${ex.id}`).getContext('2d');
        const isWalk = ex.category === 'walking';

        const labels = workouts.map(w => w.date.split('-').slice(1).join('/'));
        const datasets = [];

        if (isWalk) {
            datasets.push({
                label: '時間 (分)',
                data: workouts.map(w => w.sets[0].reps),
                borderColor: '#10b981',
                tension: 0.3
            });
        } else {
            datasets.push({
                label: '最大重量 (kg)',
                data: workouts.map(w => Math.max(...w.sets.map(s => s.weight || 0))),
                borderColor: '#6366f1',
                tension: 0.3
            });
            datasets.push({
                label: '最終回数',
                data: workouts.map(w => w.sets[w.sets.length - 1].reps || 0),
                borderColor: '#a855f7',
                borderDash: [5, 5],
                tension: 0.3
            });
        }

        new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3af', font: { size: 10 } } } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3af' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3af' } }
                }
            }
        });
    }

    // Modal Operations
    openExerciseModal(id = null) {
        this.editingExId = id;
        const modal = document.getElementById('exerciseModal');
        document.getElementById('exerciseModalTitle').textContent = id ? '種目を編集' : '種目を追加';

        if (id) {
            this.db.getExerciseById(id).then(ex => {
                document.getElementById('inputExName').value = ex.name;
                document.getElementById('selectExCategory').value = ex.category;
            });
        } else {
            document.getElementById('inputExName').value = '';
            document.getElementById('selectExCategory').value = this.settingsCategory;
        }

        this.showModal('exerciseModal');
    }

    async saveExercise() {
        const name = document.getElementById('inputExName').value;
        const category = document.getElementById('selectExCategory').value;
        if (!name) return this.showToast('名前を入力してください');

        if (this.editingExId) {
            const ex = await this.db.getExerciseById(this.editingExId);
            ex.name = name;
            ex.category = category;
            await this.db.updateExercise(ex);
        } else {
            await this.db.addExercise(name, category);
        }

        this.closeAllModals();
        this.renderSettingsList();
        this.refreshContent();
    }

    async openWorkoutModal(workoutId = null, preExId = null) {
        this.editingWorkoutId = workoutId;
        const exSelect = document.getElementById('selectWorkoutEx');
        const exercises = await this.db.getExercises();

        // Filter by current category if nothing selected
        const visibleEx = preExId ? exercises : exercises.filter(e => e.category === this.currentCategory);

        exSelect.innerHTML = visibleEx.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

        if (preExId) exSelect.value = preExId;
        document.getElementById('inputWorkoutDate').value = new Date().toISOString().split('T')[0];

        // Reset fields
        for (let i = 1; i <= 4; i++) {
            document.getElementById(`w${i}`).value = '';
            document.getElementById(`r${i}`).value = '';
        }
        document.getElementById('inputWalkTime').value = '';

        if (workoutId) {
            const w = await this.db.perform('workouts', 'readonly', s => s.get(workoutId));
            exSelect.value = w.exerciseId;
            document.getElementById('inputWorkoutDate').value = w.date;
            w.sets.forEach((s, i) => {
                if (document.getElementById(`w${i + 1}`)) document.getElementById(`w${i + 1}`).value = s.weight;
                if (document.getElementById(`r${i + 1}`)) document.getElementById(`r${i + 1}`).value = s.reps;
            });
            if (document.getElementById('inputWalkTime')) document.getElementById('inputWalkTime').value = w.sets[0].reps;
        }

        this.toggleWorkoutFormUI(parseInt(exSelect.value));
        this.showModal('setModal');
    }

    async toggleWorkoutFormUI(exId) {
        const ex = await this.db.getExerciseById(exId);
        const isWalk = ex && ex.category === 'walking';
        document.getElementById('formWalking').classList.toggle('hidden', !isWalk);
        document.getElementById('formSets').classList.toggle('hidden', isWalk);
    }

    async saveWorkout() {
        const exId = parseInt(document.getElementById('selectWorkoutEx').value);
        const date = document.getElementById('inputWorkoutDate').value;
        const ex = await this.db.getExerciseById(exId);

        const sets = [];
        if (ex.category === 'walking') {
            sets.push({ weight: 0, reps: parseInt(document.getElementById('inputWalkTime').value || 0) });
        } else {
            for (let i = 1; i <= 4; i++) {
                sets.push({
                    weight: parseFloat(document.getElementById(`w${i}`).value || 0),
                    reps: parseInt(document.getElementById(`r${i}`).value || 0)
                });
            }
        }

        if (sets[0].reps === 0) return this.showToast('記録を入力してください');

        if (this.editingWorkoutId) {
            await this.db.updateWorkout({ id: this.editingWorkoutId, exerciseId: exId, sets, date });
        } else {
            await this.db.addWorkout(exId, sets, date);
        }

        this.showToast('記録を保存しました');
        this.closeAllModals();
        this.refreshContent();
    }

    // Helpers
    async moveEx(id, dir) {
        const exercises = await this.db.getExercises(this.settingsCategory);
        const idx = exercises.findIndex(e => e.id === id);
        const targetIdx = idx + dir;
        if (targetIdx < 0 || targetIdx >= exercises.length) return;

        const a = exercises[idx];
        const b = exercises[targetIdx];
        const temp = a.order;
        a.order = b.order;
        b.order = temp;

        await this.db.updateExercise(a);
        await this.db.updateExercise(b);
        this.renderSettingsList();
    }

    async deleteEx(id) {
        if (confirm('種目と履歴をすべて削除しますか？')) {
            await this.db.deleteExercise(id);
            this.renderSettingsList();
            this.refreshContent();
        }
    }

    async handleFloatAction() {
        if (this.currentCategory === 'walking') {
            const exArr = await this.db.getExercises('walking');
            if (exArr.length > 0) this.openWorkoutModal(null, exArr[0].id);
            else this.showToast('設定からウォーキング種目を追加してください');
        } else {
            this.openWorkoutModal();
        }
    }

    showModal(id) {
        document.getElementById('modalOverlay').classList.add('active');
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeAllModals() {
        document.getElementById('modalOverlay').classList.remove('active');
        document.body.style.overflow = '';
    }

    showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        setTimeout(() => t.classList.add('hidden'), 2000);
    }

    updateDateDisplay() {
        const options = { month: 'long', day: 'numeric', weekday: 'short' };
        document.getElementById('currentDate').textContent = new Date().toLocaleDateString('ja-JP', options);
    }

    async forceUpdate() {
        if (!confirm('アプリを最新の状態に更新しますか？')) return;
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
        }
        window.location.reload(true);
    }

    async exportCsv() {
        const ex = await this.db.getExercises();
        const wo = await this.db.getWorkouts();
        let csv = "Type,Date,ExerciseName,Set1_W,Set1_R,Set2_W,Set2_R,Set3_W,Set3_R,Set4_W,Set4_R\n";

        wo.forEach(w => {
            const e = ex.find(item => item.id === w.exerciseId);
            if (!e) return;
            const line = ["Record", w.date, `"${e.name}"`];
            w.sets.forEach(s => { line.push(s.weight); line.push(s.reps); });
            csv += line.join(',') + "\n";
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `traintrack_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    }

    importCsv(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const lines = e.target.result.split('\n');
            const exMap = {}; // name -> newId

            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                if (parts.length < 3) continue;

                const name = parts[2].replace(/"/g, '');
                if (!exMap[name]) {
                    // Simple check/add exercise. Here we assume 'push' if new. 
                    // Robust import would need category in CSV, but for v2.0 we keep it simple or use existing.
                    const existing = await this.db.getExercises();
                    const match = existing.find(ex => ex.name === name);
                    if (match) exMap[name] = match.id;
                    else {
                        const newId = await this.db.addExercise(name, 'push');
                        exMap[name] = newId;
                    }
                }

                const sets = [];
                for (let j = 0; j < 4; j++) {
                    sets.push({ weight: parseFloat(parts[3 + j * 2] || 0), reps: parseInt(parts[4 + j * 2] || 0) });
                }
                await this.db.addWorkout(exMap[name], sets, parts[1]);
            }
            this.showToast('インポートしました');
            this.refreshContent();
        };
        reader.readAsText(file);
    }
}

// Boot
window.onload = () => {
    window.app = new TrainTrackApp();
};

// SW
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js?v=200');
}
