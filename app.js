// Database Management
class DatabaseManager {
    constructor() {
        this.dbName = 'TrainTrackDB';
        this.dbVersion = 2;
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

                // Exercises store
                if (!db.objectStoreNames.contains('exercises')) {
                    const exerciseStore = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
                    exerciseStore.createIndex('category', 'category', { unique: false });
                    exerciseStore.createIndex('name', 'name', { unique: false });
                }

                // Workout sessions store
                if (!db.objectStoreNames.contains('workouts')) {
                    const workoutStore = db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
                    workoutStore.createIndex('exerciseId', 'exerciseId', { unique: false });
                    workoutStore.createIndex('date', 'date', { unique: false });
                }

                // Delete old sets store if exists
                if (db.objectStoreNames.contains('sets')) {
                    db.deleteObjectStore('sets');
                }
            };
        });
    }

    async addExercise(name, category) {
        const transaction = this.db.transaction(['exercises'], 'readwrite');
        const store = transaction.objectStore('exercises');
        return store.add({ name, category, createdAt: new Date().toISOString() });
    }

    async updateExercise(id, name, category) {
        const transaction = this.db.transaction(['exercises'], 'readwrite');
        const store = transaction.objectStore('exercises');
        const exercise = await this.getExerciseById(id);
        exercise.name = name;
        exercise.category = category;
        return store.put(exercise);
    }

    async getExerciseById(id) {
        const transaction = this.db.transaction(['exercises'], 'readonly');
        const store = transaction.objectStore('exercises');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getExercises(category = null) {
        const transaction = this.db.transaction(['exercises'], 'readonly');
        const store = transaction.objectStore('exercises');

        if (category) {
            const index = store.index('category');
            return this.getAllFromIndex(index, category);
        }

        return this.getAllFromStore(store);
    }

    async deleteExercise(id) {
        const transaction = this.db.transaction(['exercises'], 'readwrite');
        const store = transaction.objectStore('exercises');
        return store.delete(id);
    }

    async addWorkout(exerciseId, sets, date) {
        const transaction = this.db.transaction(['workouts'], 'readwrite');
        const store = transaction.objectStore('workouts');
        return store.add({
            exerciseId,
            sets: sets, // Array of {weight, reps}
            date: date || new Date().toISOString()
        });
    }

    async updateWorkout(id, exerciseId, sets, date) {
        const transaction = this.db.transaction(['workouts'], 'readwrite');
        const store = transaction.objectStore('workouts');
        return store.put({
            id,
            exerciseId,
            sets: sets,
            date: date
        });
    }

    async getWorkoutById(id) {
        const transaction = this.db.transaction(['workouts'], 'readonly');
        const store = transaction.objectStore('workouts');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteWorkout(id) {
        const transaction = this.db.transaction(['workouts'], 'readwrite');
        const store = transaction.objectStore('workouts');
        return store.delete(id);
    }

    async getWorkouts(exerciseId = null) {
        const transaction = this.db.transaction(['workouts'], 'readonly');
        const store = transaction.objectStore('workouts');

        if (exerciseId) {
            const index = store.index('exerciseId');
            return this.getAllFromIndex(index, exerciseId);
        }

        return this.getAllFromStore(store);
    }

    getAllFromStore(store) {
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    getAllFromIndex(index, query) {
        return new Promise((resolve, reject) => {
            const request = index.getAll(query);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearAllData() {
        const transaction = this.db.transaction(['exercises', 'workouts'], 'readwrite');
        await transaction.objectStore('exercises').clear();
        await transaction.objectStore('workouts').clear();
    }
}

// App State Manager
class AppState {
    constructor() {
        this.currentView = 'record';
        this.currentCategory = 'push';
        this.currentSettingsCategory = 'push';
        this.editingExerciseId = null;
        this.editingWorkoutId = null;
    }

    setView(view) {
        this.currentView = view;
    }

    setCategory(category) {
        this.currentCategory = category;
    }

    setSettingsCategory(category) {
        this.currentSettingsCategory = category;
    }

    setEditingExercise(id) {
        this.editingExerciseId = id;
    }

    setEditingWorkout(id) {
        this.editingWorkoutId = id;
    }
}

// Main App
class TrainTrackApp {
    constructor() {
        this.db = new DatabaseManager();
        this.state = new AppState();
        this.init();
    }

    async init() {
        try {
            await this.db.init();
            this.setupEventListeners();
            this.updateCurrentDate();
            this.renderExerciseList();
            this.renderSettingsExercises();
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });

        // Category selector
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.selectCategory(category);
            });
        });

        // Settings category tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.selectSettingsCategory(category);
            });
        });

        // FAB - Add Workout
        document.getElementById('addSetBtn').addEventListener('click', () => {
            this.openSetModal();
        });

        // Add Exercise Button
        document.getElementById('addExerciseBtn').addEventListener('click', () => {
            this.openExerciseModal();
        });

        // Exercise Modal
        document.getElementById('closeExerciseModal').addEventListener('click', () => {
            this.closeExerciseModal();
        });
        document.getElementById('cancelExerciseBtn').addEventListener('click', () => {
            this.closeExerciseModal();
        });
        document.getElementById('saveExerciseBtn').addEventListener('click', () => {
            this.saveExercise();
        });

        // Set Modal
        document.getElementById('closeSetModal').addEventListener('click', () => {
            this.closeSetModal();
        });
        document.getElementById('cancelSetBtn').addEventListener('click', () => {
            this.closeSetModal();
        });
        document.getElementById('saveSetBtn').addEventListener('click', () => {
            this.saveWorkout();
        });

        // Data management
        document.getElementById('exportDataBtn').addEventListener('click', () => {
            this.exportData();
        });
        document.getElementById('clearDataBtn').addEventListener('click', () => {
            this.clearData();
        });

        // History filter
        document.getElementById('historyFilter').addEventListener('change', () => {
            this.renderHistory();
        });

        // Initial Empty State button (if exists)
        const emptyBtn = document.getElementById('emptyAddExerciseBtn');
        if (emptyBtn) {
            emptyBtn.addEventListener('click', () => {
                this.openExerciseModal();
            });
        }
    }

    updateCurrentDate() {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
        const dateStr = now.toLocaleDateString('ja-JP', options);
        document.getElementById('currentDate').textContent = dateStr;
    }

    switchView(view) {
        this.state.setView(view);

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });

        // Update views
        document.querySelectorAll('.view').forEach(v => {
            v.classList.toggle('hidden', v.id !== `${view}View`);
        });

        // Render content based on view
        if (view === 'history') {
            this.renderHistory();
        } else if (view === 'analytics') {
            this.renderAnalytics();
        } else if (view === 'settings') {
            this.renderSettingsExercises();
        } else if (view === 'record') {
            this.renderExerciseList();
        }
    }

    selectCategory(category) {
        this.state.setCategory(category);

        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });

        this.renderExerciseList();
    }

    selectSettingsCategory(category) {
        this.state.setSettingsCategory(category);

        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === category);
        });

        this.renderSettingsExercises();
    }

    async renderExerciseList() {
        const container = document.getElementById('exerciseList');
        const exercises = await this.db.getExercises(this.state.currentCategory);
        const fab = document.getElementById('addSetBtn');

        if (exercises.length === 0) {
            if (fab) fab.style.display = 'none'; // Hide FAB when empty
            container.innerHTML = `
                <div class="empty-state">
                    <button class="empty-icon-btn" id="emptyAddExerciseBtn">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
                        </svg>
                    </button>
                    <h3>種目を追加しましょう</h3>
                    <p>アイコンまたは設定タブから種目を登録して、トレーニングを開始できます</p>
                </div>
            `;

            // Add listener to the empty state button
            document.getElementById('emptyAddExerciseBtn').addEventListener('click', () => {
                this.openExerciseModal();
            });
            return;
        }

        if (fab) fab.style.display = 'flex'; // Show FAB when exercises exist

        const html = exercises.map(exercise => `
            <div class="exercise-card">
                <div class="exercise-header">
                    <div class="exercise-name">${exercise.name}</div>
                </div>
                <div class="exercise-stats">
                    <div class="stat">
                        <div class="stat-label">前回</div>
                        <div class="stat-value" id="last-${exercise.id}">-</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">最高</div>
                        <div class="stat-value" id="max-${exercise.id}">-</div>
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;

        // Load stats for each exercise
        exercises.forEach(exercise => this.loadExerciseStats(exercise.id));
    }

    async loadExerciseStats(exerciseId) {
        const workouts = await this.db.getWorkouts(exerciseId);

        if (workouts.length === 0) return;

        // Sort by date
        workouts.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Get the latest workout's weight (4th set -> 3rd set -> 2nd set -> 1st set)
        const latestWorkout = workouts[0];
        let lastWeight = null;

        // Priority: 4th set, then 3rd, then 2nd, then 1st
        for (let i = latestWorkout.sets.length - 1; i >= 0; i--) {
            if (latestWorkout.sets[i] && latestWorkout.sets[i].weight) {
                lastWeight = latestWorkout.sets[i].weight;
                break;
            }
        }

        if (lastWeight) {
            document.getElementById(`last-${exerciseId}`).textContent = `${lastWeight}kg`;
        }

        // Max weight across all workouts and all sets
        let maxWeight = 0;
        workouts.forEach(workout => {
            workout.sets.forEach(set => {
                if (set && set.weight > maxWeight) {
                    maxWeight = set.weight;
                }
            });
        });

        if (maxWeight > 0) {
            document.getElementById(`max-${exerciseId}`).textContent = `${maxWeight}kg`;
        }
    }

    async renderSettingsExercises() {
        const container = document.getElementById('exerciseManagement');
        const exercises = await this.db.getExercises(this.state.currentSettingsCategory);

        if (exercises.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>このカテゴリに種目がありません</p>
                </div>
            `;
            return;
        }

        const html = exercises.map(exercise => `
            <div class="exercise-item">
                <div class="exercise-item-name">${exercise.name}</div>
                <div class="exercise-item-actions">
                    <button class="icon-btn" onclick="app.editExerciseItem(${exercise.id})" title="編集">✏️</button>
                    <button class="icon-btn" onclick="app.deleteExerciseItem(${exercise.id})" title="削除">🗑️</button>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    async editExerciseItem(id) {
        this.state.setEditingExercise(id);
        const exercise = await this.db.getExerciseById(id);

        document.getElementById('exerciseModalTitle').textContent = '種目を編集';
        document.getElementById('exerciseName').value = exercise.name;
        document.getElementById('exerciseCategory').value = exercise.category;

        document.getElementById('exerciseModal').classList.add('active');
    }

    async deleteExerciseItem(id) {
        if (!confirm('この種目を削除しますか？関連する記録も全て削除されます。')) {
            return;
        }

        await this.db.deleteExercise(id);
        this.renderSettingsExercises();
        this.renderExerciseList();
        this.showToast('🗑️ 種目を削除しました');
    }

    openExerciseModal() {
        this.state.setEditingExercise(null);
        const modal = document.getElementById('exerciseModal');
        const categorySelect = document.getElementById('exerciseCategory');

        document.getElementById('exerciseModalTitle').textContent = '種目を追加';
        document.getElementById('exerciseName').value = '';
        categorySelect.value = this.state.currentSettingsCategory;

        modal.classList.add('active');
    }

    closeExerciseModal() {
        const modal = document.getElementById('exerciseModal');
        modal.classList.remove('active');
        document.getElementById('exerciseName').value = '';
        this.state.setEditingExercise(null);
    }

    async saveExercise() {
        const name = document.getElementById('exerciseName').value.trim();
        const category = document.getElementById('exerciseCategory').value;

        if (!name) {
            alert('種目名を入力してください');
            return;
        }

        if (this.state.editingExerciseId) {
            // Update existing exercise
            await this.db.updateExercise(this.state.editingExerciseId, name, category);
            this.showToast('✅ 種目を更新しました');
        } else {
            // Add new exercise
            await this.db.addExercise(name, category);
            this.showToast('✅ 種目を追加しました');
        }

        this.closeExerciseModal();
        this.renderSettingsExercises();
        this.renderExerciseList();
    }

    async openSetModal(workoutId = null) {
        const modal = document.getElementById('setModal');
        const select = document.getElementById('setExercise');
        const dateInput = document.getElementById('workoutDate');

        // Set today's date by default
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;

        if (workoutId) {
            // Edit mode
            this.state.setEditingWorkout(workoutId);
            const workout = await this.db.getWorkoutById(workoutId);
            const exercise = await this.db.getExerciseById(workout.exerciseId);

            document.getElementById('setModalTitle').textContent = 'トレーニングを編集';

            // Set date
            const workoutDate = new Date(workout.date).toISOString().split('T')[0];
            dateInput.value = workoutDate;

            // Populate exercise select with all exercises
            const allExercises = await this.db.getExercises();
            select.innerHTML = allExercises.map(e =>
                `<option value="${e.id}" ${e.id === workout.exerciseId ? 'selected' : ''}>${e.name}</option>`
            ).join('');

            // Fill in set data
            for (let i = 0; i < 4; i++) {
                const setNum = i + 1;
                const set = workout.sets[i];
                if (set) {
                    document.getElementById(`setWeight${setNum}`).value = set.weight;
                    document.getElementById(`setReps${setNum}`).value = set.reps;
                } else {
                    document.getElementById(`setWeight${setNum}`).value = '';
                    document.getElementById(`setReps${setNum}`).value = '';
                }
            }
        } else {
            // Add mode
            this.state.setEditingWorkout(null);
            document.getElementById('setModalTitle').textContent = 'トレーニングを記録';

            // Populate exercise select
            const exercises = await this.db.getExercises(this.state.currentCategory);

            if (exercises.length === 0) {
                alert('先に種目を追加してください');
                this.switchView('settings');
                return;
            }

            select.innerHTML = '<option value="">種目を選択</option>' +
                exercises.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

            // Clear all inputs
            for (let i = 1; i <= 4; i++) {
                document.getElementById(`setWeight${i}`).value = '';
                document.getElementById(`setReps${i}`).value = '';
            }
        }

        modal.classList.add('active');
    }

    closeSetModal() {
        const modal = document.getElementById('setModal');
        modal.classList.remove('active');
        this.state.setEditingWorkout(null);
    }

    async saveWorkout() {
        const exerciseId = parseInt(document.getElementById('setExercise').value);
        const dateInput = document.getElementById('workoutDate').value;

        if (!exerciseId) {
            alert('種目を選択してください');
            return;
        }

        if (!dateInput) {
            alert('日付を選択してください');
            return;
        }

        // Convert date to ISO string
        const selectedDate = new Date(dateInput + 'T12:00:00').toISOString();

        // Collect all sets
        const sets = [];
        for (let i = 1; i <= 4; i++) {
            const weight = document.getElementById(`setWeight${i}`).value;
            const reps = document.getElementById(`setReps${i}`).value;

            if (weight && reps) {
                sets.push({
                    weight: parseFloat(weight),
                    reps: parseInt(reps)
                });
            }
        }

        if (sets.length === 0) {
            alert('少なくとも1セット分のデータを入力してください');
            return;
        }

        if (this.state.editingWorkoutId) {
            // Update existing workout
            await this.db.updateWorkout(this.state.editingWorkoutId, exerciseId, sets, selectedDate);
            this.showToast('✅ 記録を更新しました');
        } else {
            // Add new workout
            await this.db.addWorkout(exerciseId, sets, selectedDate);
            this.showToast(`✅ ${sets.length}セット記録しました！`);
        }

        this.closeSetModal();
        this.renderExerciseList();

        // If currently on history view, refresh it
        if (this.state.currentView === 'history') {
            this.renderHistory();
        }
    }

    async renderHistory() {
        const container = document.getElementById('historyList');
        const filter = document.getElementById('historyFilter').value;

        const allWorkouts = await this.db.getWorkouts();
        const allExercises = await this.db.getExercises();

        if (allWorkouts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <h3>記録がありません</h3>
                    <p>トレーニングを記録すると、ここに履歴が表示されます</p>
                </div>
            `;
            return;
        }

        // Group by date
        const grouped = {};
        allWorkouts.forEach(workout => {
            const exercise = allExercises.find(e => e.id === workout.exerciseId);
            if (!exercise) return;

            if (filter !== 'all' && exercise.category !== filter) return;

            const date = new Date(workout.date).toLocaleDateString('ja-JP');
            if (!grouped[date]) grouped[date] = [];

            grouped[date].push({ ...workout, exerciseName: exercise.name, exerciseCategory: exercise.category });
        });

        const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

        const html = dates.map(date => {
            const workouts = grouped[date];

            return `
                <div class="history-item">
                    <div class="history-date">${date}</div>
                    ${workouts.map(workout => `
                        <div class="history-workout-entry">
                            <div class="history-workout-header">
                                <div class="history-exercise">${workout.exerciseName}</div>
                                <div class="history-actions">
                                    <button class="icon-btn-small" onclick="app.editWorkout(${workout.id})" title="編集">✏️</button>
                                    <button class="icon-btn-small" onclick="app.deleteWorkout(${workout.id})" title="削除">🗑️</button>
                                </div>
                            </div>
                            <div class="history-sets">
                                ${workout.sets.map((set, i) => `
                                    <div class="set-badge">${i + 1}セット: ${set.weight}kg × ${set.reps}回</div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');

        container.innerHTML = html || '<div class="empty-state"><p>該当する記録がありません</p></div>';
    }

    async editWorkout(id) {
        await this.openSetModal(id);
    }

    async deleteWorkout(id) {
        if (!confirm('この記録を削除しますか？')) {
            return;
        }

        await this.db.deleteWorkout(id);
        this.renderHistory();
        this.renderExerciseList();
        this.showToast('🗑️ 記録を削除しました');
    }

    async renderAnalytics() {
        const select = document.getElementById('analyticsExercise');
        const exercises = await this.db.getExercises();

        select.innerHTML = '<option value="">種目を選択</option>' +
            exercises.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

        // Add event listener for exercise selection
        select.onchange = async (e) => {
            const exerciseId = parseInt(e.target.value);
            if (exerciseId) {
                await this.renderExerciseChart(exerciseId);
            } else {
                this.clearChart();
            }
        };

        // Calculate overall stats
        const allWorkouts = await this.db.getWorkouts();
        const uniqueDates = new Set(allWorkouts.map(w => new Date(w.date).toDateString()));

        let totalSets = 0;
        let maxWeight = 0;
        let totalVolume = 0;

        allWorkouts.forEach(workout => {
            workout.sets.forEach(set => {
                totalSets++;
                if (set.weight > maxWeight) maxWeight = set.weight;
                totalVolume += set.weight * set.reps;
            });
        });

        document.querySelector('.stat-card:nth-child(1) .stat-value').textContent = `${uniqueDates.size}日`;
        document.querySelector('.stat-card:nth-child(2) .stat-value').textContent = `${totalSets}セット`;
        document.querySelector('.stat-card:nth-child(3) .stat-value').textContent = maxWeight > 0 ? `${maxWeight}kg` : '-';
        document.querySelector('.stat-card:nth-child(4) .stat-value').textContent = `${totalVolume.toLocaleString()}kg`;

        // Initial clear
        this.clearChart();
    }

    async renderExerciseChart(exerciseId) {
        if (typeof Chart === 'undefined') {
            const container = document.querySelector('.chart-container');
            container.innerHTML = '<div class="chart-error">グラフライブラリを読み込めませんでした。</div>';
            return;
        }

        const workouts = await this.db.getWorkouts(exerciseId);
        const placeholder = document.getElementById('chartPlaceholder');

        if (workouts.length === 0) {
            this.clearChart();
            if (placeholder) placeholder.style.display = 'block';
            return;
        }

        if (placeholder) placeholder.style.display = 'none';

        // Sort by date ascending for chart
        workouts.sort((a, b) => new Date(a.date) - new Date(b.date));

        const labels = [];
        const maxWeights = [];
        const avgWeights = [];

        workouts.forEach(workout => {
            const date = new Date(workout.date);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
            labels.push(dateStr);

            let maxWeight = 0;
            let totalWeightForSession = 0;
            let sessionSets = 0;

            workout.sets.forEach(set => {
                if (set && set.weight) {
                    if (set.weight > maxWeight) maxWeight = set.weight;
                    totalWeightForSession += set.weight;
                    sessionSets++;
                }
            });

            maxWeights.push(maxWeight);
            avgWeights.push(sessionSets > 0 ? parseFloat((totalWeightForSession / sessionSets).toFixed(1)) : 0);
        });

        if (this.chart) {
            this.chart.destroy();
        }

        const ctx = document.getElementById('progressChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '最大重量',
                        data: maxWeights,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: '#6366f1'
                    },
                    {
                        label: '平均重量',
                        data: avgWeights,
                        borderColor: '#a855f7',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.4,
                        fill: false,
                        pointRadius: 3,
                        pointBackgroundColor: '#a855f7'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#9ca3af',
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        titleColor: '#f9fafb',
                        bodyColor: '#d1d5db',
                        padding: 12,
                        displayColors: true
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#9ca3af'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(75, 85, 99, 0.2)'
                        },
                        ticks: {
                            color: '#9ca3af',
                            callback: (value) => value + 'kg'
                        }
                    }
                }
            }
        });
    }

    clearChart() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        const placeholder = document.getElementById('chartPlaceholder');
        if (placeholder) placeholder.style.display = 'block';
    }

    async exportData() {
        const exercises = await this.db.getExercises();
        const workouts = await this.db.getWorkouts();

        const data = { exercises, workouts, exportDate: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `traintrack-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast('✅ データをエクスポートしました');
    }

    async clearData() {
        if (!confirm('全てのデータを削除しますか？この操作は取り消せません。')) {
            return;
        }

        if (!confirm('本当に削除しますか？')) {
            return;
        }

        await this.db.clearAllData();
        this.renderExerciseList();
        this.renderSettingsExercises();
        this.showToast('🗑️ 全データを削除しました');
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(16, 185, 129, 0.9);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.75rem;
            font-weight: 600;
            z-index: 10000;
            animation: slideDown 0.3s ease-out;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

// Initialize app
let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app = new TrainTrackApp();
    });
} else {
    app = new TrainTrackApp();
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}
