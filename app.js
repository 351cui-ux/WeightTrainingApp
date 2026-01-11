// Database Management
class DatabaseManager {
    constructor() {
        this.dbName = 'TrainTrackDB';
        this.dbVersion = 4;
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
                const oldVersion = event.oldVersion;

                // Exercises store
                let exerciseStore;
                if (!db.objectStoreNames.contains('exercises')) {
                    exerciseStore = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
                    exerciseStore.createIndex('category', 'category', { unique: false });
                    exerciseStore.createIndex('name', 'name', { unique: false });
                    exerciseStore.createIndex('order', 'order', { unique: false });
                } else {
                    exerciseStore = event.target.transaction.objectStore('exercises');
                    if (!exerciseStore.indexNames.contains('order')) {
                        exerciseStore.createIndex('order', 'order', { unique: false });
                    }
                }

                // Initial data migration for order if upgrading to v3 or v4
                if (oldVersion < 4) {
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore('exercises');
                    const request = store.getAll();
                    request.onsuccess = () => {
                        const exercises = request.result;
                        exercises.forEach((ex, index) => {
                            if (ex.order === undefined) {
                                ex.order = index;
                                store.put(ex);
                            }
                        });
                    };
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
        const all = await this.getExercises();
        const maxOrder = all.length > 0 ? Math.max(...all.map(e => e.order || 0)) : -1;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['exercises'], 'readwrite');
            const store = transaction.objectStore('exercises');
            const request = store.add({
                name,
                category,
                order: maxOrder + 1,
                createdAt: new Date().toISOString()
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateExercise(id, name, category, order = null) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['exercises'], 'readwrite');
            const store = transaction.objectStore('exercises');
            const getRequest = store.get(Number(id));

            getRequest.onsuccess = () => {
                const exercise = getRequest.result;
                if (!exercise) {
                    resolve(null);
                    return;
                }
                exercise.name = name;
                exercise.category = category;
                if (order !== null) exercise.order = order;

                const putRequest = store.put(exercise);
                putRequest.onsuccess = () => resolve(putRequest.result);
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async getExerciseById(id) {
        const transaction = this.db.transaction(['exercises'], 'readonly');
        const store = transaction.objectStore('exercises');
        return new Promise((resolve, reject) => {
            const request = store.get(Number(id));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getExercises(category = null) {
        const transaction = this.db.transaction(['exercises'], 'readonly');
        const store = transaction.objectStore('exercises');

        let exercises;
        if (category) {
            const index = store.index('category');
            exercises = await this.getAllFromIndex(index, category);
        } else {
            exercises = await this.getAllFromStore(store);
        }

        // Always sort by order
        return exercises.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    async deleteExercise(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['exercises'], 'readwrite');
            const store = transaction.objectStore('exercises');
            const request = store.delete(Number(id));
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async addWorkout(exerciseId, sets, date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['workouts'], 'readwrite');
            const store = transaction.objectStore('workouts');
            const request = store.add({
                exerciseId: Number(exerciseId),
                sets: sets, // Array of {weight, reps}
                date: date || new Date().toISOString()
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateWorkout(id, exerciseId, sets, date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['workouts'], 'readwrite');
            const store = transaction.objectStore('workouts');
            const request = store.put({
                id: Number(id),
                exerciseId: Number(exerciseId),
                sets: sets,
                date: date
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
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
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['workouts'], 'readwrite');
            const store = transaction.objectStore('workouts');
            const request = store.delete(Number(id));
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
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
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['exercises', 'workouts'], 'readwrite');
            const exStore = transaction.objectStore('exercises');
            const wkStore = transaction.objectStore('workouts');
            exStore.clear();
            wkStore.clear();
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
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
        console.log('App: Initializing...');
        try {
            await this.db.init();
            console.log('App: Database initialized successfully');
        } catch (error) {
            console.error('App: Database Initialization error:', error);
            alert('【致命的エラー】データベースの読み込みに失敗しました。');
            return;
        }

        try {
            this.setupEventListeners();
            console.log('App: Event listeners setup complete');
        } catch (error) {
            console.error('App: Event Listener Setup error:', error);
        }

        try {
            this.updateCurrentDate();
            this.renderExerciseList();
            this.renderSettingsExercises();
            console.log('App: Initial rendering triggered');
        } catch (error) {
            console.error('App: Initial Rendering error:', error);
        }
    }

    setupEventListeners() {
        const safeBind = (id, event, callback) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener(event, callback);
            } else {
                console.warn(`App: Element with ID "${id}" not found. Skipping binding.`);
            }
        };

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
                const btnEl = e.target.closest('.category-btn');
                if (btnEl) {
                    const category = btnEl.dataset.category;
                    this.selectCategory(category);
                }
            });
        });

        // Settings category tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabEl = e.target.closest('.category-tab');
                if (tabEl) {
                    const category = tabEl.dataset.category;
                    this.selectSettingsCategory(category);
                }
            });
        });

        // FAB - Add Workout
        safeBind('addSetBtn', 'click', async () => {
            if (this.state.currentCategory === 'walking') {
                const exercises = await this.db.getExercises('walking');
                const walkingEx = exercises.find(e => e.category === 'walking');
                if (walkingEx) {
                    this.openSetModal(null, walkingEx.id);
                } else {
                    this.openSetModal();
                }
            } else {
                this.openSetModal();
            }
        });

        // Add Exercise Button
        safeBind('addExerciseBtn', 'click', () => {
            this.openExerciseModal();
        });

        // Exercise Modal
        safeBind('closeExerciseModal', 'click', () => {
            this.closeExerciseModal();
        });
        safeBind('cancelExerciseBtn', 'click', () => {
            this.closeExerciseModal();
        });
        safeBind('saveExerciseBtn', 'click', () => {
            this.saveExercise();
        });

        // Set Modal
        safeBind('closeSetModal', 'click', () => {
            this.closeSetModal();
        });
        safeBind('cancelSetBtn', 'click', () => {
            this.closeSetModal();
        });
        safeBind('saveSetBtn', 'click', () => {
            this.saveWorkout();
        });

        // Initial Empty State button (if exists)
        safeBind('emptyAddExerciseBtn', 'click', () => {
            this.openExerciseModal();
        });
    }

    updateCurrentDate() {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
        const dateStr = now.toLocaleDateString('ja-JP', options);
        document.getElementById('currentDate').innerHTML = `${dateStr} <span style="margin-left: 8px; font-size: 0.75rem; opacity: 0.7; font-weight: normal;">v1.16</span>`;
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

    async selectCategory(category) {
        this.state.setCategory(category);

        // Update tabs UI
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });

        // Check if walking exercise exists (optional: keep auto-create or rely on empty state)
        // User wants "like PPL", so maybe rely on empty state/add like PPL?
        // "The previous logic had auto-create".
        // If I remove auto-modal, I should probably also stick to standard rendering.

        // However, to keep it smooth, I'll ensure "Walking" exercise exists silently if not present?
        // Or just render list. If empty, user sees standard empty state for walking.
        // Let's keep it simple and consistent.
        await this.renderExerciseList();
        await this.renderCategoryHistory();
    }

    async renderExerciseList() {
        const container = document.getElementById('exerciseList');
        const currentCat = this.state.currentCategory;
        const exercises = await this.db.getExercises(currentCat);
        const fab = document.getElementById('addSetBtn');


        if (exercises.length === 0) {
            if (fab) fab.style.display = 'none'; // Hide FAB when empty
            container.innerHTML = `
                <div class="empty-state">
                    <h3>種目がありません</h3>
                    <p>設定タブから種目を登録して、トレーニングを開始しましょう</p>
                </div>
            `;
            return;
        }

        if (fab) fab.style.display = 'flex'; // Show FAB when exercises exist

        const html = exercises.map(exercise => `
            <div class="exercise-card" data-exercise-id="${exercise.id}" onclick="app.openSetModal(null, ${exercise.id})">
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
        try {
            const workouts = await this.db.getWorkouts(exerciseId);
            const exercise = await this.db.getExerciseById(exerciseId);

            if (!workouts || workouts.length === 0 || !exercise) return;

            // Sort by date session
            workouts.sort((a, b) => new Date(b.date) - new Date(a.date));
            const latestWorkout = workouts[0];
            if (!latestWorkout || !latestWorkout.sets) return;

            // Robust check for walking
            const isWalking = exercise.category === 'walking' || exercise.name === 'ウォーキング' || exercise.name === 'Walking';

            // Find stats container for this exercise card using data attribute
            const card = document.querySelector(`.exercise-card[data-exercise-id="${exerciseId}"]`);
            if (!card) return;
            const statsRow = card.querySelector('.exercise-stats');
            if (!statsRow) return;

            if (isWalking) {
                if (latestWorkout.sets[0]) {
                    const lastTime = latestWorkout.sets[0].reps;
                    const el = document.getElementById(`last-${exerciseId}`);
                    if (el) el.textContent = `${lastTime}分`;
                }

                // Hide the second stat for walking
                const stats = statsRow.querySelectorAll('.stat');
                if (stats[1]) stats[1].style.display = 'none';
            } else {
                // Get the latest workout's weight
                let lastWeight = null;
                for (let i = latestWorkout.sets.length - 1; i >= 0; i--) {
                    if (latestWorkout.sets[i] && latestWorkout.sets[i].weight) {
                        lastWeight = latestWorkout.sets[i].weight;
                        break;
                    }
                }

                if (lastWeight) {
                    const el = document.getElementById(`last-${exerciseId}`);
                    if (el) el.textContent = `${lastWeight}kg`;
                }

                // Final Reps (Reps of the very last set of the latest workout)
                const lastSet = latestWorkout.sets[latestWorkout.sets.length - 1];
                if (lastSet && lastSet.reps) {
                    const el = document.getElementById(`max-${exerciseId}`);
                    if (el) el.textContent = `${lastSet.reps}回`;
                    const labels = statsRow.querySelectorAll('.stat-label');
                    if (labels[1]) labels[1].textContent = '最終回数';
                }
            }
        } catch (error) {
            console.error(`App: Error loading stats for exercise ${exerciseId}:`, error);
        }
    }

    async selectSettingsCategory(category) {
        this.state.setSettingsCategory(category);

        // Update tabs UI
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === category);
        });

        this.renderSettingsExercises();
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

        const html = exercises.map((exercise, index) => `
            <div class="exercise-item">
                <div class="exercise-item-name">${exercise.name}</div>
                <div class="exercise-item-actions">
                    <div class="reorder-btns">
                        <button class="icon-btn-small" onclick="app.moveExercise(${exercise.id}, -1)" ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button class="icon-btn-small" onclick="app.moveExercise(${exercise.id}, 1)" ${index === exercises.length - 1 ? 'disabled' : ''}>↓</button>
                    </div>
                    <button class="icon-btn" onclick="app.editExerciseItem(${exercise.id})" title="編集">✏️</button>
                    <button class="icon-btn" onclick="app.deleteExerciseItem(${exercise.id})" title="削除">🗑️</button>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    async moveExercise(id, direction) {
        const exercises = await this.db.getExercises(this.state.currentSettingsCategory);
        const index = exercises.findIndex(e => e.id === id);
        if (index === -1) return;

        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= exercises.length) return;

        const currentEx = exercises[index];
        const targetEx = exercises[targetIndex];

        // Swap order
        const tempOrder = currentEx.order;
        currentEx.order = targetEx.order;
        targetEx.order = tempOrder;

        await this.db.updateExercise(currentEx.id, currentEx.name, currentEx.category, currentEx.order);
        await this.db.updateExercise(targetEx.id, targetEx.name, targetEx.category, targetEx.order);

        this.renderSettingsExercises();
        this.renderExerciseList();
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

    async openSetModal(workoutId = null, preSelectedExerciseId = null) {
        const modal = document.getElementById('setModal');
        const select = document.getElementById('setExercise');
        const dateInput = document.getElementById('workoutDate');
        const walkingArea = document.getElementById('walkingInputArea');
        const setsArea = document.getElementById('setsInputArea');

        document.body.style.overflow = 'hidden'; // Prevent background scroll

        // Set today's date
        dateInput.value = new Date().toISOString().split('T')[0];

        // Reset inputs
        for (let i = 1; i <= 4; i++) {
            document.getElementById(`setWeight${i}`).value = '';
            document.getElementById(`setReps${i}`).value = '';
        }
        document.getElementById('walkingTime').value = '';

        // Filter exercises by current category
        const exercises = await this.db.getExercises(this.state.currentCategory);
        select.innerHTML = '<option value="">種目を選択</option>' +
            exercises.map(e => `<option value="${e.id}" data-category="${e.category}">${e.name}</option>`).join('');

        const updateUI = () => {
            const opt = select.options[select.selectedIndex];
            const cat = opt ? opt.dataset.category : '';
            if (cat === 'walking') {
                walkingArea.style.display = 'block';
                setsArea.style.display = 'none';

                // Disable selection if it's the only logic
                // If we pre-selected walking, maybe disable it to show "fixed" state
                // But only if we are in "Walking mode" logic implicitly
                // For now, if category is walking, we can choose to disable or not.
                // User said "unnatural to choose". So disabling is good or hiding.
                // Let's disable it if it was preSelected as walking.
            } else {
                walkingArea.style.display = 'none';
                setsArea.style.display = 'block';
            }
        };
        select.onchange = updateUI;
        select.disabled = false; // Reset disabled state

        if (workoutId) {
            this.state.setEditingWorkout(workoutId);
            const workoutData = await this.db.getWorkoutById(workoutId);
            const exerciseData = exercises.find(e => e.id === Number(workoutData.exerciseId));

            document.getElementById('setModalTitle').textContent = 'トレーニングを編集';
            dateInput.value = new Date(workoutData.date).toISOString().split('T')[0];
            select.value = workoutData.exerciseId;

            if (exerciseData && exerciseData.category === 'walking') {
                document.getElementById('walkingTime').value = workoutData.sets[0].reps;
                select.disabled = true; // Lock exercise for walking record
            } else {
                workoutData.sets.forEach((set, index) => {
                    if (index < 4) {
                        document.getElementById(`setWeight${index + 1}`).value = set.weight;
                        document.getElementById(`setReps${index + 1}`).value = set.reps;
                    }
                });
            }
        } else {
            document.getElementById('setModalTitle').textContent = 'トレーニングを記録';
            this.state.setEditingWorkout(null);

            if (preSelectedExerciseId) {
                select.value = preSelectedExerciseId;
                // If pre-selected is walking, disable select
                const preEx = exercises.find(e => e.id === Number(preSelectedExerciseId));
                if (preEx && preEx.category === 'walking') {
                    select.disabled = true;
                }
            }
        }

        updateUI();
        modal.classList.add('active');
    }

    closeSetModal() {
        const modal = document.getElementById('setModal');
        modal.classList.remove('active');
        this.state.setEditingWorkout(null);
        document.body.style.overflow = ''; // Fix scroll bug
    }

    async saveWorkout() {
        const exerciseId = parseInt(document.getElementById('setExercise').value);
        const dateInput = document.getElementById('workoutDate').value;
        const walkingArea = document.getElementById('walkingInputArea');

        if (!exerciseId || !dateInput) {
            alert('種目と日付を選択してください');
            return;
        }

        const selectedDate = new Date(dateInput + 'T12:00:00').toISOString();
        const sets = [];

        if (walkingArea.style.display === 'block') {
            const time = parseFloat(document.getElementById('walkingTime').value);
            if (isNaN(time) || time <= 0) {
                alert('ウォーキング時間を入力してください');
                return;
            }
            sets.push({ weight: 0, reps: time });
        } else {
            for (let i = 1; i <= 4; i++) {
                const weight = parseFloat(document.getElementById(`setWeight${i}`).value);
                const reps = parseInt(document.getElementById(`setReps${i}`).value);
                if (!isNaN(weight) && !isNaN(reps)) {
                    sets.push({ weight, reps });
                }
            }
            if (sets.length === 0) {
                alert('少なくとも1セット入力してください');
                return;
            }
        }

        if (this.state.editingWorkoutId) {
            await this.db.updateWorkout(this.state.editingWorkoutId, exerciseId, sets, selectedDate);
            this.showToast('✅ 記録を更新しました');
        } else {
            await this.db.addWorkout(exerciseId, sets, selectedDate);
            this.showToast('✅ 記録を保存しました');
        }

        this.closeSetModal();
        this.closeSetModal();
        this.renderCategoryHistory(); // Update local history
        this.renderExerciseList();
    }

    async renderCategoryHistory() {
        const container = document.getElementById('categoryHistoryList');
        if (!container) return; // Should exist in record view now

        const category = this.state.currentCategory;
        const allWorkouts = await this.db.getWorkouts();
        const allExercises = await this.db.getExercises();

        if (allWorkouts.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>まだ記録がありません</p></div>';
            return;
        }

        // Filter valid workouts for current category
        const filteredWorkouts = [];
        allWorkouts.forEach(workout => {
            const exercise = allExercises.find(e => e.id === workout.exerciseId);
            if (!exercise) return;
            if (exercise.category === category) {
                filteredWorkouts.push({ ...workout, exerciseName: exercise.name, exerciseCategory: exercise.category });
            }
        });

        if (filteredWorkouts.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>このカテゴリの記録はまだありません</p></div>';
            return;
        }

        // Group by date
        const grouped = {};
        filteredWorkouts.forEach(workout => {
            const date = new Date(workout.date).toLocaleDateString('ja-JP');
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(workout);
        });

        const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

        // Limit to recent 5 days for compactness logic if desired, or show all
        // User asked for "History in Record column", implies relevant history. 
        // Showing all might be long, but let's show all for now or maybe limit?
        // Let's show all but in a scrollable container in CSS if needed.

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
                                ${workout.exerciseCategory === 'walking'
                    ? `<div class="set-badge">🚶 ${workout.sets[0].reps}分間</div>`
                    : workout.sets.map((set, i) => `
                                        <div class="set-badge">${i + 1}セット: ${set.weight}kg × ${set.reps}回</div>
                                    `).join('')
                }
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    async editWorkout(id) {
        await this.openSetModal(id);
    }

    async deleteWorkout(id) {
        if (!confirm('この記録を削除しますか？')) {
            return;
        }

        await this.db.deleteWorkout(id);
        this.renderCategoryHistory(); // Re-render category history
        this.renderExerciseList();
        this.showToast('🗑️ 記録を削除しました');
    }

    async renderAnalytics() {
        const chartsList = document.getElementById('chartsList');
        const exercises = await this.db.getExercises();

        // Calculate overall stats
        const allWorkouts = await this.db.getWorkouts();
        const uniqueDates = new Set(allWorkouts.map(w => new Date(w.date).toDateString()));


        allWorkouts.forEach(workout => {
            // Keep loop for consistency if needed later, or remove if unused. 
            // Currently only used for uniqueDates which is derived from map outside loop.
            // Actually uniqueDates uses allWorkouts directly. This loop was for deleted stats.
        });

        document.querySelector('.stat-card:nth-child(1) .stat-value').textContent = `${uniqueDates.size} 日`;

        // Render charts for each exercise
        this.clearCharts();
        chartsList.innerHTML = '';
        this.charts = {};

        for (const exercise of exercises) {
            const workouts = await this.db.getWorkouts(exercise.id);
            if (workouts.length === 0) continue;

            const chartCard = document.createElement('div');
            chartCard.className = 'chart-card';
            const canvasId = `chart-${exercise.id}`;

            chartCard.innerHTML = `
                <div class="chart-title">
                    <span>${exercise.category === 'walking' ? '👟' : '💪'}</span>
                    ${exercise.name}
                </div>
                <div class="chart-container">
                    <canvas id="${canvasId}"></canvas>
                </div>
            `;
            chartsList.appendChild(chartCard);

            await this.renderSingleChart(exercise.id, canvasId);
        }

        if (chartsList.innerHTML === '') {
            chartsList.innerHTML = '<div class="empty-state"><p>表示できるデータがありません。トレーニングを記録してください。</p></div>';
        }
    }

    async renderSingleChart(exerciseId, canvasId) {
        if (typeof Chart === 'undefined') return;

        const workouts = await this.db.getWorkouts(exerciseId);
        const exercise = await this.db.getExerciseById(exerciseId);

        if (workouts.length === 0 || !exercise) return;

        workouts.sort((a, b) => new Date(a.date) - new Date(b.date));

        const labels = [];
        const data1 = [];
        const data2 = [];
        // Robust check for walking category or name
        const isWalking = exercise.category === 'walking' || exercise.name === 'ウォーキング' || exercise.name === 'Walking';

        workouts.forEach(workout => {
            const dateStr = new Date(workout.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
            labels.push(dateStr);

            if (isWalking) {
                data1.push(workout.sets[0].reps);
            } else {
                let maxW = 0;
                let lastReps = 0;

                workout.sets.forEach(set => {
                    if (set && set.weight !== undefined) {
                        if (set.weight > maxW) maxW = set.weight;
                        lastReps = set.reps; // Keep overwriting to get the last one
                    }
                });

                data1.push(maxW);
                data2.push(lastReps);
            }
        });

        const ctx = document.getElementById(canvasId).getContext('2d');
        const datasets = [{
            label: isWalking ? '歩行時間' : '最大重量',
            data: data1,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#6366f1'
        }];

        if (!isWalking) {
            datasets.push({
                label: '最終回数',
                data: data2,
                borderColor: '#a855f7',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 5],
                tension: 0.4,
                fill: false,
                pointRadius: 3,
                pointBackgroundColor: '#a855f7'
            });
        }

        this.charts[exerciseId] = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#9ca3af', usePointStyle: true, font: { size: 10 } }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        titleColor: '#f9fafb',
                        bodyColor: '#d1d5db',
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: (context) => {
                                return (context.dataset.label || '') + ': ' + context.parsed.y + (isWalking ? '分' : 'kg');
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(75, 85, 99, 0.2)' },
                        ticks: {
                            color: '#9ca3af',
                            font: { size: 10 },
                            callback: (value) => value + (isWalking ? '分' : 'kg')
                        }
                    }
                }
            }
        });
    }

    clearCharts() {
        if (this.charts) {
            Object.values(this.charts).forEach(chart => chart.destroy());
            this.charts = {};
        }
    }

    // Data management functions removed

    showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
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

    async exportData() {
        const exercises = await this.db.getExercises();
        const workouts = await this.db.getWorkouts();

        // Export exercises as CSV
        let csvContent = "type,id,name,category,order\n";
        exercises.forEach(ex => {
            const safeName = (ex.name || '').replace(/"/g, '""');
            csvContent += `exercise,${ex.id},"${safeName}",${ex.category},${ex.order || 0}\n`;
        });

        // Export workouts as CSV
        csvContent += "\ntype,id,exerciseId,date,sets\n";
        workouts.forEach(w => {
            const setsStr = JSON.stringify(w.sets).replace(/"/g, '""');
            csvContent += `workout,${w.id},${w.exerciseId},${w.date},"${setsStr}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `traintrack_data_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast('📤 データをエクスポートしました');
    }

    async importData(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;
            const lines = content.split('\n');
            let importedExCount = 0;
            let importedWkCount = 0;

            // Map to track old ID to new ID for exercise mapping
            const exerciseIdMap = new Map();

            // Simple CSV parser
            for (let line of lines) {
                if (!line.trim() || line.startsWith('type')) continue;

                // Handle quoted strings for exercise names and sets JSON
                const parts = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        if (inQuotes && line[i + 1] === '"') {
                            current += '"';
                            i++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        parts.push(current);
                        current = '';
                    } else {
                        current += char;
                    }
                }
                parts.push(current);

                const type = parts[0];
                if (type === 'exercise') {
                    const [, oldId, name, category, order] = parts;
                    // Recreate as new to avoid conflict, but track mapping
                    const newId = await this.db.addExercise(name, category);
                    if (order !== undefined) {
                        await this.db.updateExercise(newId, name, category, Number(order));
                    }
                    exerciseIdMap.set(oldId, newId);
                    importedExCount++;
                } else if (type === 'workout') {
                    const [, , oldExId, date, setsStr] = parts;
                    const newExId = exerciseIdMap.get(oldExId);

                    if (newExId && setsStr) {
                        try {
                            const sets = JSON.parse(setsStr);
                            await this.db.addWorkout(newExId, sets, date);
                            importedWkCount++;
                        } catch (err) {
                            console.error('Error parsing workout sets:', err);
                        }
                    }
                }
            }

            this.showToast(`📥 種目:${importedExCount}件, 記録:${importedWkCount}件をインポートしました`);
            this.renderSettingsExercises();
            this.renderExerciseList();
        };
        reader.readAsText(file);
    }
}

// Initialize app
let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app = new TrainTrackApp();
        window.app = app; // Expose for inline handlers
    });
} else {
    app = new TrainTrackApp();
    window.app = app; // Expose for inline handlers
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}
