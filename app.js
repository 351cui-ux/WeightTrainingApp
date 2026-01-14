class DatabaseManager {
    constructor() {
        this.dbName = 'TrainTrackDBv2';
        this.db = null;
    }

    async init() {
        return new Promise(resolve => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('exercises')) {
                    db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('workouts')) {
                    db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
                }
            };
            req.onsuccess = e => { this.db = e.target.result; resolve(); };
        });
    }

    store(name, mode = 'readonly') {
        return this.db.transaction(name, mode).objectStore(name);
    }

    getAll(name) {
        return new Promise(r => {
            const q = this.store(name).getAll();
            q.onsuccess = () => r(q.result);
        });
    }

    add(name, data) {
        this.store(name, 'readwrite').add(data);
    }

    put(name, data) {
        this.store(name, 'readwrite').put(data);
    }

    delete(name, id) {
        this.store(name, 'readwrite').delete(id);
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
        this.bind();
        this.render();
        document.getElementById('currentDate').textContent =
            new Date().toLocaleDateString('ja-JP');
    }

    bind() {
        document.querySelectorAll('.cat-btn,.tab-btn').forEach(b => {
            b.onclick = () => { this.activeCategory = b.dataset.category; this.render(); };
        });

        document.querySelectorAll('.nav-item').forEach(b => {
            b.onclick = () => this.switchView(b.dataset.view);
        });

        globalAddBtn.onclick = () => this.openSetModal();
        addExerciseBtn.onclick = () => this.openExModal();
        btnSaveEx.onclick = () => this.saveExercise();
        btnSaveSet.onclick = () => this.saveWorkout();

        document.querySelectorAll('.modal-close').forEach(b =>
            b.onclick = () => modalOverlay.classList.remove('active'));
    }

    switchView(v) {
        this.activeView = v;
        document.querySelectorAll('.view').forEach(e =>
            e.classList.toggle('active', e.id === v + 'View'));
        globalAddBtn.style.display = v === 'record' ? 'block' : 'none';
        this.render();
    }

    async render() {
        const exercises = await this.db.getAll('exercises');
        const workouts = await this.db.getAll('workouts');
        const today = new Date().toISOString().slice(0, 10);

        if (this.activeView === 'record') {
            exerciseGrid.innerHTML = exercises
                .filter(e => e.category === this.activeCategory)
                .map(e => {
                    const w = workouts.find(x => x.exerciseId === e.id && x.date === today);
                    if (!w) return '';
                    if (e.category === 'walking') return `<div class="exercise-card">${e.name} ${w.walkingTime}分</div>`;
                    const s = w.sets[w.sets.length - 1];
                    return `<div class="exercise-card">${e.name} ${s.weight}kg × ${s.reps}</div>`;
                }).join('');
        }

        if (this.activeView === 'history') {
            historyList.innerHTML = workouts
                .sort((a, b) => b.date.localeCompare(a.date))
                .map(w => {
                    const e = exercises.find(x => x.id === w.exerciseId);
                    if (!e) return '';
                    return `<div class="exercise-card">${w.date} - ${e.name}</div>`;
                }).join('');
        }

        if (this.activeView === 'analytics') {
            analyticsList.innerHTML = '';
            exercises.forEach(e => {
                const data = workouts.filter(w => w.exerciseId === e.id);
                if (data.length < 2) return;
                const id = 'c' + e.id;
                analyticsList.innerHTML += `<canvas id="${id}"></canvas>`;
                new Chart(document.getElementById(id), {
                    type: 'line',
                    data: {
                        labels: data.map(d => d.date),
                        datasets: [{
                            label: e.name,
                            data: data.map(d =>
                                e.category === 'walking'
                                    ? d.walkingTime
                                    : d.sets[d.sets.length - 1].weight
                            )
                        }]
                    }
                });
            });
        }

        if (this.activeView === 'settings') {
            exerciseManagementList.innerHTML = exercises
                .filter(e => e.category === this.activeCategory)
                .map(e => `
          <div class="exercise-card">
            ${e.name}
            <button onclick="app.deleteExercise(${e.id})">削除</button>
          </div>`).join('');
        }
    }

    openExModal() {
        inputExName.value = '';
        modalOverlay.classList.add('active');
        exerciseModal.classList.remove('hidden');
        setModal.classList.add('hidden');
    }

    async openSetModal() {
        const exercises = await this.db.getAll('exercises');
        selectWorkoutEx.innerHTML = exercises
            .filter(e => e.category === this.activeCategory)
            .map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        inputWorkoutDate.value = new Date().toISOString().slice(0, 10);
        modalOverlay.classList.add('active');
        setModal.classList.remove('hidden');
        exerciseModal.classList.add('hidden');
    }

    saveExercise() {
        if (!inputExName.value) return;
        this.db.add('exercises', {
            name: inputExName.value,
            category: selectExCategory.value
        });
        modalOverlay.classList.remove('active');
        this.render();
    }

    deleteExercise(id) {
        if (!confirm('削除しますか？')) return;
        this.db.delete('exercises', id);
        this.render();
    }

    saveWorkout() {
        const exId = +selectWorkoutEx.value;
        const date = inputWorkoutDate.value;
        const sets = [];
        if (w1.value && r1.value) sets.push({ weight: +w1.value, reps: +r1.value });
        if (w2.value && r2.value) sets.push({ weight: +w2.value, reps: +r2.value });
        if (sets.length) this.db.add('workouts', { exerciseId: exId, date, sets });
        modalOverlay.classList.remove('active');
        this.render();
    }
}

window.app = new TrainTrackApp();
