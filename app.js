const DB_NAME = "TrainTrackDBv2";
let db;
let currentTab = "training";
let currentCategory = "push";

const categories = ["push", "pull", "legs", "walking"];

function openDB() {
    return new Promise((resolve) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => {
            db = e.target.result;
            db.createObjectStore("exercises", { keyPath: "id", autoIncrement: true });
            db.createObjectStore("workouts", { keyPath: "id", autoIncrement: true });
        };
        req.onsuccess = e => { db = e.target.result; resolve(); };
    });
}

function qs(id) { return document.getElementById(id); }

function switchTab(tab) {
    document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
    qs(`tab-${tab}`).classList.add("active");
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add("active");
    qs("addWorkoutBtn").style.display = tab === "training" ? "flex" : "none";
    currentTab = tab;
    if (tab === "analysis") renderAnalysis();
}

function renderCategories() {
    const el = qs("categorySwitch");
    el.innerHTML = "";
    categories.forEach(c => {
        const d = document.createElement("div");
        d.className = "category" + (c === currentCategory ? " active" : "");
        d.textContent = c.toUpperCase();
        d.onclick = () => { currentCategory = c; renderCategories(); renderTraining(); };
        el.appendChild(d);
    });
}

function renderTraining() {
    const list = qs("trainingList");
    list.innerHTML = "";
    const tx = db.transaction("workouts");
    const store = tx.objectStore("workouts");
    const today = new Date().toISOString().slice(0, 10);
    store.getAll().onsuccess = e => {
        e.target.result
            .filter(w => w.date === today)
            .forEach(w => {
                const c = document.createElement("div");
                c.className = "card";
                c.textContent = JSON.stringify(w);
                list.appendChild(c);
            });
    };
}

function renderHistory() {
    const list = qs("historyList");
    list.innerHTML = "";
    db.transaction("workouts").objectStore("workouts").getAll().onsuccess = e => {
        e.target.result.sort((a, b) => b.date.localeCompare(a.date))
            .forEach(w => {
                const c = document.createElement("div");
                c.className = "card";
                c.textContent = `${w.date} ${JSON.stringify(w)}`;
                list.appendChild(c);
            });
    };
}

function renderAnalysis() {
    const ctx = qs("analysisChart");
    db.transaction("workouts").objectStore("workouts").getAll().onsuccess = e => {
        const data = e.target.result;
        new Chart(ctx, {
            type: "line",
            data: {
                labels: data.map(d => d.date),
                datasets: [{
                    label: "Weight / Time",
                    data: data.map(d => d.sets ? d.sets.slice(-1)[0].weight : d.walkingTime)
                }]
            }
        });
    };
}

document.addEventListener("DOMContentLoaded", async () => {
    await openDB();
    renderCategories();
    renderTraining();
    renderHistory();

    document.querySelectorAll(".tab").forEach(t =>
        t.onclick = () => switchTab(t.dataset.tab)
    );
});
