function icon(name, size = 20, className = "icon") {
    const body = ICONS[name];
    if (!body) return "";
    return `<span class="${className}" style="width:${size}px;height:${size}px" aria-hidden="true"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg></span>`;
}

function getTransportIconName(transport) {
    if (!transport) return "bus";
    const t = transport.toLowerCase();
    if (t.includes("colectivo") || t.includes("ómnibus") || t.includes("omnibus")) return "bus";
    if (t.includes("subte")) return "subway";
    if (t.includes("tren")) return "train";
    return "bus";
}

function getActiveCard() {
    return appState.cards.find((c) => c.id === appState.activeCardId) || appState.cards[0];
}

function persistState() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                activeCardId: appState.activeCardId,
                cards: appState.cards,
                darkMode: appState.darkMode,
            })
        );
    } catch (e) {
        console.warn("No se pudo guardar", e);
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            if (saved.cards?.length) {
                appState.cards = saved.cards;
                appState.activeCardId = saved.activeCardId || saved.cards[0].id;
                appState.darkMode = !!saved.darkMode;
                return;
            }
        }
        if (localStorage.getItem("darkMode") === "true") {
            appState.darkMode = true;
        }
    } catch (e) {
        console.warn("No se pudo cargar", e);
    }
    appState.cards = JSON.parse(JSON.stringify(DEFAULT_CARDS));
    appState.activeCardId = "card-1";
}

function parseTransactionDate(dateStr) {
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (isoMatch) {
        const [, y, m, d, h = "0", min = "0"] = isoMatch;
        return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
    }
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isSameCalendarDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(dateStr) {
    return isSameCalendarDay(parseTransactionDate(dateStr), new Date());
}

function isWithinDays(dateStr, days) {
    const d = parseTransactionDate(dateStr);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
    return d >= start && d <= now;
}

function formatTransactionDate(date) {
    const d = date instanceof Date ? date : parseTransactionDate(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
}

function formatMoney(amount) {
    return "$" + amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskCardNumber(num) {
    const s = String(num).replace(/\D/g, "").slice(-4);
    return "•••• " + (s || "0000");
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeJsString(str) {
    return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function nextTxId(card) {
    const max = card.transactions.reduce((m, t) => Math.max(m, t.id || 0), 0);
    return max + 1;
}

function getLastRecharge(card) {
    const recharges = card.transactions.filter((t) => t.type === "recharge" || t.type === "adjust");
    if (!recharges.length) return null;
    return recharges.sort((a, b) => parseTransactionDate(b.date) - parseTransactionDate(a.date))[0];
}

// ==================== INICIALIZACION ====================
window.addEventListener("load", () => initApp());

function initApp() {
    loadState();
    setupAlertToggle();
    renderCardSwitcher();
    refreshUI();
    selectAmount(200, document.querySelectorAll(".amount-btn")[1]);
    loadDarkMode();
    document.getElementById("customAmount")?.addEventListener("input", () => {
        document.querySelectorAll(".amount-btn").forEach((b) => b.classList.remove("selected"));
    });
}

function refreshUI() {
    updateBalance();
    renderTrips();
    renderHistory();
    updateStats();
    renderCardSwitcher();
    updateAlertToggle();
    persistState();
}

function renderCardSwitcher() {
    const card = getActiveCard();
    if (!card) return;
    const nameEl = document.getElementById("activeCardName");
    const numEl = document.getElementById("activeCardNumber");
    const chip = document.getElementById("activeCardChip");
    if (nameEl) nameEl.textContent = card.name;
    if (numEl) numEl.textContent = maskCardNumber(card.number);
    if (chip) chip.style.background = `linear-gradient(135deg, ${card.color}, ${card.color}99)`;
}

function setupAlertToggle() {
    const toggle = document.getElementById("alertToggle");
    if (!toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = getActiveCard();
        card.alertsEnabled = !card.alertsEnabled;
        updateAlertToggle();
        showToast(card.alertsEnabled ? "Alertas activadas" : "Alertas desactivadas", "success", card.alertsEnabled ? "bell" : "bell-off");
        persistState();
    });
}

function updateAlertToggle() {
    const toggle = document.getElementById("alertToggle");
    const card = getActiveCard();
    if (!toggle || !card) return;
    toggle.classList.toggle("active", card.alertsEnabled);
    toggle.innerHTML = icon(card.alertsEnabled ? "bell" : "bell-off", 22);
    toggle.setAttribute("aria-label", card.alertsEnabled ? "Desactivar alertas" : "Activar alertas");
}

function updateBalance() {
    const card = getActiveCard();
    if (!card) return;
    const formatted = formatMoney(card.balance);
    document.getElementById("balanceAmount").textContent = formatted;
    const rechargeEl = document.getElementById("rechargeModalBalance");
    if (rechargeEl) rechargeEl.textContent = formatted;

    const last = getLastRecharge(card);
    const lastEl = document.getElementById("lastRechargeText");
    if (lastEl) {
        if (!last) {
            lastEl.textContent = "Sin cargas registradas";
        } else {
            const d = parseTransactionDate(last.date);
            const label = isToday(last.date) ? "Hoy" : d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
            const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
            lastEl.textContent = `${label} a las ${time}`;
        }
    }

    const statusEl = document.getElementById("balanceStatus");
    if (statusEl) {
        statusEl.innerHTML = `${icon("check", 14, "icon icon-inline")} Actualizado`;
    }

    if (card.balance < 100 && card.alertsEnabled) {
        setTimeout(() => showToast("Tu saldo es menor a $100", "warning", "alert-triangle"), 500);
    }
}

function updateStats() {
    const card = getActiveCard();
    if (!card) return;
    const trips = card.transactions.filter((t) => t.type === "trip");
    const todayTrips = trips.filter((t) => isToday(t.date));
    const weekTrips = trips.filter((t) => isWithinDays(t.date, 7));
    const todayTotal = todayTrips.reduce((s, t) => s + t.amount, 0);
    const weekTotal = weekTrips.reduce((s, t) => s + t.amount, 0);

    document.getElementById("todaySpent").textContent = formatMoney(todayTotal);
    const countEl = document.getElementById("todayTripsCount");
    if (countEl) countEl.textContent = todayTrips.length === 1 ? "1 viaje" : `${todayTrips.length} viajes`;

    const weekVal = document.getElementById("weekSpent");
    const weekSub = document.getElementById("weekTripsCount");
    if (weekVal) weekVal.textContent = formatMoney(weekTotal);
    if (weekSub) weekSub.textContent = weekTrips.length === 1 ? "1 viaje" : `${weekTrips.length} viajes`;
}

function renderTrips() {
    const tripList = document.getElementById("tripList");
    const card = getActiveCard();
    const todayTrips = card.transactions
        .filter((t) => t.type === "trip" && isToday(t.date))
        .sort((a, b) => parseTransactionDate(b.date) - parseTransactionDate(a.date));

    if (todayTrips.length === 0) {
        tripList.innerHTML = '<p class="empty-state">No hay viajes hoy en esta tarjeta</p>';
    } else {
        tripList.innerHTML = todayTrips
            .map(
                (trip) => `
            <div class="trip-item" onclick="showTripDetail('${escapeJsString(trip.transport)}')">
                <div class="trip-icon">${icon(getTransportIconName(trip.transport), 26, "icon icon-trip")}</div>
                <div class="trip-details">
                    <div class="trip-name">${escapeHtml(trip.transport)}</div>
                    <div class="trip-info">
                        <span>${parseTransactionDate(trip.date).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span>${escapeHtml(trip.location)}</span>
                    </div>
                </div>
                <div class="trip-amount">-${formatMoney(trip.amount)}</div>
            </div>`
            )
            .join("");
    }
}

function openRechargeModal() {
    document.getElementById("rechargeModal").classList.add("active");
    document.body.style.overflow = "hidden";
    updateBalance();
}

function closeRechargeModal() {
    document.getElementById("rechargeModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function selectAmount(amount, btn) {
    appState.selectedAmount = amount;
    document.getElementById("customAmount").value = "";
    document.querySelectorAll(".amount-btn").forEach((b) => b.classList.remove("selected"));
    if (btn) btn.classList.add("selected");
}

function confirmRecharge() {
    const customAmount = parseFloat(document.getElementById("customAmount").value);
    const amount = customAmount || appState.selectedAmount;
    const card = getActiveCard();

    if (isNaN(amount) || amount < 50 || amount > 5000) {
        showToast("Monto debe estar entre $50 y $5.000", "error", "x-circle");
        return;
    }

    const btn = event.target;
    const btnText = btn.textContent;
    btn.textContent = "Procesando...";
    btn.disabled = true;

    setTimeout(() => {
        card.balance += amount;
        const method =
            document.querySelector('input[name="payment"]:checked')?.value === "transfer"
                ? "Transferencia"
                : document.querySelector('input[name="payment"]:checked')?.value === "mercadopago"
                  ? "Mercado Pago"
                  : "Tarjeta";
        card.transactions.unshift({
            id: nextTxId(card),
            type: "recharge",
            amount,
            date: formatTransactionDate(new Date()),
            method,
        });
        refreshUI();
        showToast(`Recarga de ${formatMoney(amount)} exitosa. Nuevo saldo: ${formatMoney(card.balance)}`, "success", "check-circle");
        btn.textContent = btnText;
        btn.disabled = false;
        closeRechargeModal();
    }, 1200);
}

function openAdjustBalanceModal() {
    const card = getActiveCard();
    document.getElementById("adjustBalanceInput").value = card.balance;
    document.getElementById("adjustBalanceNote").value = "";
    document.getElementById("adjustBalanceModal").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeAdjustBalanceModal() {
    document.getElementById("adjustBalanceModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function confirmAdjustBalance() {
    const card = getActiveCard();
    const newBalance = parseFloat(document.getElementById("adjustBalanceInput").value);
    const note = document.getElementById("adjustBalanceNote").value.trim() || "Ajuste manual de saldo";

    if (isNaN(newBalance) || newBalance < 0 || newBalance > 99999) {
        showToast("Ingresá un saldo válido (0 - 99.999)", "error", "x-circle");
        return;
    }

    const diff = newBalance - card.balance;
    card.balance = newBalance;
    card.transactions.unshift({
        id: nextTxId(card),
        type: "adjust",
        amount: Math.abs(diff),
        date: formatTransactionDate(new Date()),
        note,
        direction: diff >= 0 ? "in" : "out",
    });
    refreshUI();
    closeAdjustBalanceModal();
    showToast(`Saldo actualizado a ${formatMoney(newBalance)}`, "success", "wallet");
}

function openHistory() {
    document.getElementById("historyModal").classList.add("active");
    document.body.style.overflow = "hidden";
    renderHistory();
}

function closeHistoryModal() {
    document.getElementById("historyModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function renderHistory() {
    const container = document.getElementById("historyContainer");
    const card = getActiveCard();
    let filtered = card.transactions;

    if (appState.currentFilter === "viajes") filtered = filtered.filter((t) => t.type === "trip");
    else if (appState.currentFilter === "recargas") filtered = filtered.filter((t) => t.type === "recharge" || t.type === "adjust");

    if (!filtered.length) {
        container.innerHTML = '<p class="empty-state">Sin movimientos</p>';
        return;
    }

    container.innerHTML = filtered
        .map((trans) => {
            const isRecharge = trans.type === "recharge";
            const isAdjust = trans.type === "adjust";
            let iconName = "credit-card";
            let title = "";
            let subtitle = "";
            let amountClass = "charge";
            let amountText = "";

            if (isRecharge) {
                iconName = "credit-card";
                title = `Recarga · ${trans.method}`;
                subtitle = trans.method;
                amountClass = "credit";
                amountText = `+${formatMoney(trans.amount)}`;
            } else if (isAdjust) {
                iconName = "pen-line";
                title = trans.direction === "out" ? "Ajuste de saldo" : "Saldo ingresado";
                subtitle = trans.note || "Ajuste manual";
                amountClass = trans.direction === "out" ? "charge" : "credit";
                amountText = trans.direction === "out" ? `-${formatMoney(trans.amount)}` : `+${formatMoney(trans.amount)}`;
            } else {
                iconName = getTransportIconName(trans.transport);
                title = trans.transport;
                subtitle = trans.location;
                amountText = `-${formatMoney(trans.amount)}`;
            }

            return `
                <div class="history-item ${isRecharge || (isAdjust && trans.direction !== "out") ? "recharge" : ""}">
                    <div class="history-date">${escapeHtml(trans.date)}</div>
                    <div class="history-details">
                        <div class="history-left">
                            <div class="history-icon">${icon(iconName, 20, "icon")}</div>
                            <div class="history-text">
                                <div class="history-type">${escapeHtml(title)}</div>
                                <div class="history-time">${escapeHtml(subtitle)}</div>
                            </div>
                        </div>
                        <div class="history-amount ${amountClass}">${amountText}</div>
                    </div>
                </div>`;
        })
        .join("");
}

function filterHistory(type, tabEl) {
    appState.currentFilter = type;
    document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.remove("active"));
    if (tabEl) tabEl.classList.add("active");
    renderHistory();
}

function openCardsModal() {
    renderCardsList();
    document.getElementById("cardsModal").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeCardsModal() {
    document.getElementById("cardsModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function renderCardsList() {
    const list = document.getElementById("cardsList");
    list.innerHTML = appState.cards
        .map((c) => {
            const active = c.id === appState.activeCardId;
            return `
            <button type="button" class="card-list-item ${active ? "active" : ""}" onclick="switchCard('${c.id}')">
                <div class="card-list-chip" style="background:linear-gradient(135deg,${c.color},${c.color}99)"></div>
                <div class="card-list-info">
                    <div class="card-list-name">${escapeHtml(c.name)}</div>
                    <div class="card-list-meta">${maskCardNumber(c.number)} · ${formatMoney(c.balance)}</div>
                </div>
                ${active ? icon("check", 20, "icon icon-check") : ""}
            </button>`;
        })
        .join("");
}

function switchCard(cardId) {
    if (!appState.cards.some((c) => c.id === cardId)) return;
    appState.activeCardId = cardId;
    appState.currentFilter = "all";
    document.querySelectorAll(".filter-tab").forEach((tab, i) => tab.classList.toggle("active", i === 0));
    refreshUI();
    closeCardsModal();
    const card = getActiveCard();
    showToast(`Tarjeta: ${card.name}`, "info", "layers");
}

function openAddCardForm() {
    document.getElementById("newCardName").value = "";
    document.getElementById("newCardNumber").value = "";
    document.getElementById("newCardBalance").value = "0";
    document.getElementById("addCardForm").classList.remove("hidden");
}

function confirmAddCard() {
    const name = document.getElementById("newCardName").value.trim() || "Nueva SUBE";
    const number = document.getElementById("newCardNumber").value.trim() || String(Math.floor(1000 + Math.random() * 9000));
    const balance = parseFloat(document.getElementById("newCardBalance").value) || 0;
    const colors = ["#0066CC", "#00AA44", "#FF9900", "#8B5CF6", "#DD3333"];
    const id = "card-" + Date.now();
    const card = {
        id,
        name,
        number,
        color: colors[appState.cards.length % colors.length],
        balance,
        alertsEnabled: false,
        transactions: balance > 0 ? [{ id: 1, type: "adjust", amount: balance, date: formatTransactionDate(new Date()), note: "Saldo inicial", direction: "in" }] : [],
    };
    appState.cards.push(card);
    appState.activeCardId = id;
    document.getElementById("addCardForm").classList.add("hidden");
    refreshUI();
    renderCardsList();
    showToast(`Tarjeta "${name}" agregada`, "success", "plus");
    persistState();
}

function openSettings() {
    document.getElementById("settingsModal").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeSettings() {
    document.getElementById("settingsModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function toggleDarkMode() {
    appState.darkMode = !appState.darkMode;
    document.body.classList.toggle("dark-mode", appState.darkMode);
    document.getElementById("darkModeToggle").classList.toggle("active", appState.darkMode);
    persistState();
    showToast(appState.darkMode ? "Modo oscuro activado" : "Modo claro activado", "success", appState.darkMode ? "moon" : "sun");
}

function loadDarkMode() {
    if (appState.darkMode) {
        document.body.classList.add("dark-mode");
        document.getElementById("darkModeToggle")?.classList.add("active");
    }
}

function showToast(message, variant = "success", iconName = "check-circle") {
    const notif = document.getElementById("successNotif");
    notif.className = "success-notification show toast-" + variant;
    notif.innerHTML = `${icon(iconName, 18, "icon icon-toast")}<span>${escapeHtml(message)}</span>`;
    void notif.offsetWidth;
    clearTimeout(notif._timer);
    notif._timer = setTimeout(() => notif.classList.remove("show"), 3200);
}

function showTripDetail(trip) {
    showToast(trip, "info", "map-pin");
}

function closeAllModals() {
    closeRechargeModal();
    closeHistoryModal();
    closeSettings();
    closeCardsModal();
    closeAdjustBalanceModal();
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
});

["rechargeModal", "historyModal", "settingsModal", "cardsModal", "adjustBalanceModal"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
            if (id === "rechargeModal") closeRechargeModal();
            else if (id === "historyModal") closeHistoryModal();
            else if (id === "settingsModal") closeSettings();
            else if (id === "cardsModal") closeCardsModal();
            else closeAdjustBalanceModal();
        }
    });
});

        function injectStaticIcons() {
            const set = (id, name, size) => { const el = document.getElementById(id); if (el) el.innerHTML = icon(name, size); };
            set('settingsMenuBtn', 'settings', 20);
            set('closeRechargeBtn', 'x', 18);
            set('closeHistoryBtn', 'x', 18);
            set('closeSettingsBtn', 'x', 18);
            set('closeCardsBtn', 'x', 18);
            set('closeAdjustBtn', 'x', 18);
            set('iconRecharge', 'credit-card', 22);
            set('iconAdjust', 'wallet', 22);
            set('iconHistory', 'bar-chart', 22);
            set('cardSwitcherChevron', 'chevron-down', 20);
            const addLbl = document.getElementById('addCardBtnLabel');
            if (addLbl) addLbl.innerHTML = icon('plus', 18) + ' Agregar tarjeta';
            document.querySelectorAll('.pay-icon').forEach(el => {
                el.innerHTML = icon(el.dataset.icon, 20);
            });
        }
        const _initApp = initApp;
        initApp = function() {
            _initApp();
            injectStaticIcons();
            const card = getActiveCard();
            const adjName = document.getElementById('adjustCardName');
            if (adjName && card) adjName.textContent = card.name;
        };
        const _openAdjust = openAdjustBalanceModal;
        openAdjustBalanceModal = function() {
            const card = getActiveCard();
            const adjName = document.getElementById('adjustCardName');
            if (adjName && card) adjName.textContent = card.name;
            _openAdjust();
        };

    </script>

</body>
</html>


// App logic (included in index.html)
const STORAGE_KEY = "appSube_v2";

const DEFAULT_CARDS = [
    {
        id: "card-1",
        name: "SUBE Personal",
        number: "4521",
        color: "#0066CC",
        balance: 1245.5,
        alertsEnabled: false,
        transactions: [
            { id: 1, type: "recharge", amount: 500, date: "2026-06-02 14:30", method: "Tarjeta" },
            { id: 2, type: "trip", transport: "Subte Línea B", amount: 12.5, date: "2026-06-02 08:45", location: "Estación Flores" },
            { id: 3, type: "trip", transport: "Colectivo 56", amount: 15, date: "2026-06-02 12:15", location: "Av. Rivadavia" },
            { id: 4, type: "trip", transport: "Subte Línea D", amount: 12.5, date: "2026-06-01 18:30", location: "Estación Catalinas" },
            { id: 5, type: "recharge", amount: 400, date: "2026-06-01 10:00", method: "Mercado Pago" },
        ],
    },
    {
        id: "card-2",
        name: "SUBE Trabajo",
        number: "8832",
        color: "#00AA44",
        balance: 380.25,
        alertsEnabled: true,
        transactions: [
            { id: 1, type: "trip", transport: "Subte Línea D", amount: 12.5, date: "2026-06-02 07:20", location: "Catalinas" },
            { id: 2, type: "trip", transport: "Colectivo 152", amount: 15, date: "2026-06-02 18:10", location: "Microcentro" },
            { id: 3, type: "recharge", amount: 300, date: "2026-05-28 09:00", method: "Transferencia" },
        ],
    },
    {
        id: "card-3",
        name: "SUBE Estudiante",
        number: "1190",
        color: "#FF9900",
        balance: 95,
        alertsEnabled: false,
        transactions: [
            { id: 1, type: "trip", transport: "Colectivo 39", amount: 15, date: "2026-06-02 16:40", location: "Flores" },
            { id: 2, type: "adjust", amount: 95, date: "2026-06-01 12:00", note: "Saldo ingresado manualmente" },
        ],
    },
];

let appState = {
    activeCardId: "card-1",
    cards: [],
    selectedAmount: 200,
    darkMode: false,
    currentFilter: "all",
};

// ==================== ICONOS SVG ====================
const ICONS = {
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    "bell-off": '<path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>',
    "credit-card": '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    "bar-chart": '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    bus: '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s-1-2-3-2-3 2-3 2H6s-1-2-3-2-3 2H2"/><path d="M8 18v2"/><path d="M16 18v2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    train: '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/><path d="M8 15h0"/><path d="M16 15h0"/>',
    subway: '<path d="M4 15h16"/><path d="M4 15l3-9h10l3 9"/><path d="m9 15 1.5 4"/><path d="m15 15-1.5 4"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/>',
    bank: '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    "x-circle": '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    "alert-triangle": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    "map-pin": '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    "pen-line": '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    "chevron-down": '<polyline points="6 9 12 15 18 9"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    "sliders": '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>',
};

function icon(name, size = 20, className = "icon") {
    const body = ICONS[name];
    if (!body) return "";
    return `<span class="${className}" style="width:${size}px;height:${size}px" aria-hidden="true"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg></span>`;
}

function getTransportIconName(transport) {
    if (!transport) return "bus";
    const t = transport.toLowerCase();
    if (t.includes("colectivo") || t.includes("ómnibus") || t.includes("omnibus")) return "bus";
    if (t.includes("subte")) return "subway";
    if (t.includes("tren")) return "train";
    return "bus";
}

function getActiveCard() {
    return appState.cards.find((c) => c.id === appState.activeCardId) || appState.cards[0];
}

function persistState() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                activeCardId: appState.activeCardId,
                cards: appState.cards,
                darkMode: appState.darkMode,
            })
        );
    } catch (e) {
        console.warn("No se pudo guardar", e);
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            if (saved.cards?.length) {
                appState.cards = saved.cards;
                appState.activeCardId = saved.activeCardId || saved.cards[0].id;
                appState.darkMode = !!saved.darkMode;
                return;
            }
        }
        if (localStorage.getItem("darkMode") === "true") {
            appState.darkMode = true;
        }
    } catch (e) {
        console.warn("No se pudo cargar", e);
    }
    appState.cards = JSON.parse(JSON.stringify(DEFAULT_CARDS));
    appState.activeCardId = "card-1";
}

function parseTransactionDate(dateStr) {
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (isoMatch) {
        const [, y, m, d, h = "0", min = "0"] = isoMatch;
        return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
    }
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isSameCalendarDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(dateStr) {
    return isSameCalendarDay(parseTransactionDate(dateStr), new Date());
}

function isWithinDays(dateStr, days) {
    const d = parseTransactionDate(dateStr);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
    return d >= start && d <= now;
}

function formatTransactionDate(date) {
    const d = date instanceof Date ? date : parseTransactionDate(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
}

function formatMoney(amount) {
    return "$" + amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskCardNumber(num) {
    const s = String(num).replace(/\D/g, "").slice(-4);
    return "•••• " + (s || "0000");
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeJsString(str) {
    return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function nextTxId(card) {
    const max = card.transactions.reduce((m, t) => Math.max(m, t.id || 0), 0);
    return max + 1;
}

function getLastRecharge(card) {
    const recharges = card.transactions.filter((t) => t.type === "recharge" || t.type === "adjust");
    if (!recharges.length) return null;
    return recharges.sort((a, b) => parseTransactionDate(b.date) - parseTransactionDate(a.date))[0];
}

// ==================== INICIALIZACION ====================
window.addEventListener("load", () => initApp());

function initApp() {
    loadState();
    setupAlertToggle();
    renderCardSwitcher();
    refreshUI();
    selectAmount(200, document.querySelectorAll(".amount-btn")[1]);
    loadDarkMode();
    document.getElementById("customAmount")?.addEventListener("input", () => {
        document.querySelectorAll(".amount-btn").forEach((b) => b.classList.remove("selected"));
    });
}

function refreshUI() {
    updateBalance();
    renderTrips();
    renderHistory();
    updateStats();
    renderCardSwitcher();
    updateAlertToggle();
    persistState();
}

function renderCardSwitcher() {
    const card = getActiveCard();
    if (!card) return;
    const nameEl = document.getElementById("activeCardName");
    const numEl = document.getElementById("activeCardNumber");
    const chip = document.getElementById("activeCardChip");
    if (nameEl) nameEl.textContent = card.name;
    if (numEl) numEl.textContent = maskCardNumber(card.number);
    if (chip) chip.style.background = `linear-gradient(135deg, ${card.color}, ${card.color}99)`;
}

function setupAlertToggle() {
    const toggle = document.getElementById("alertToggle");
    if (!toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = getActiveCard();
        card.alertsEnabled = !card.alertsEnabled;
        updateAlertToggle();
        showToast(card.alertsEnabled ? "Alertas activadas" : "Alertas desactivadas", "success", card.alertsEnabled ? "bell" : "bell-off");
        persistState();
    });
}

function updateAlertToggle() {
    const toggle = document.getElementById("alertToggle");
    const card = getActiveCard();
    if (!toggle || !card) return;
    toggle.classList.toggle("active", card.alertsEnabled);
    toggle.innerHTML = icon(card.alertsEnabled ? "bell" : "bell-off", 22);
    toggle.setAttribute("aria-label", card.alertsEnabled ? "Desactivar alertas" : "Activar alertas");
}

function updateBalance() {
    const card = getActiveCard();
    if (!card) return;
    const formatted = formatMoney(card.balance);
    document.getElementById("balanceAmount").textContent = formatted;
    const rechargeEl = document.getElementById("rechargeModalBalance");
    if (rechargeEl) rechargeEl.textContent = formatted;

    const last = getLastRecharge(card);
    const lastEl = document.getElementById("lastRechargeText");
    if (lastEl) {
        if (!last) {
            lastEl.textContent = "Sin cargas registradas";
        } else {
            const d = parseTransactionDate(last.date);
            const label = isToday(last.date) ? "Hoy" : d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
            const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
            lastEl.textContent = `${label} a las ${time}`;
        }
    }

    const statusEl = document.getElementById("balanceStatus");
    if (statusEl) {
        statusEl.innerHTML = `${icon("check", 14, "icon icon-inline")} Actualizado`;
    }

    if (card.balance < 100 && card.alertsEnabled) {
        setTimeout(() => showToast("Tu saldo es menor a $100", "warning", "alert-triangle"), 500);
    }
}

function updateStats() {
    const card = getActiveCard();
    if (!card) return;
    const trips = card.transactions.filter((t) => t.type === "trip");
    const todayTrips = trips.filter((t) => isToday(t.date));
    const weekTrips = trips.filter((t) => isWithinDays(t.date, 7));
    const todayTotal = todayTrips.reduce((s, t) => s + t.amount, 0);
    const weekTotal = weekTrips.reduce((s, t) => s + t.amount, 0);

    document.getElementById("todaySpent").textContent = formatMoney(todayTotal);
    const countEl = document.getElementById("todayTripsCount");
    if (countEl) countEl.textContent = todayTrips.length === 1 ? "1 viaje" : `${todayTrips.length} viajes`;

    const weekVal = document.getElementById("weekSpent");
    const weekSub = document.getElementById("weekTripsCount");
    if (weekVal) weekVal.textContent = formatMoney(weekTotal);
    if (weekSub) weekSub.textContent = weekTrips.length === 1 ? "1 viaje" : `${weekTrips.length} viajes`;
}

function renderTrips() {
    const tripList = document.getElementById("tripList");
    const card = getActiveCard();
    const todayTrips = card.transactions
        .filter((t) => t.type === "trip" && isToday(t.date))
        .sort((a, b) => parseTransactionDate(b.date) - parseTransactionDate(a.date));

    if (todayTrips.length === 0) {
        tripList.innerHTML = '<p class="empty-state">No hay viajes hoy en esta tarjeta</p>';
    } else {
        tripList.innerHTML = todayTrips
            .map(
                (trip) => `
            <div class="trip-item" onclick="showTripDetail('${escapeJsString(trip.transport)}')">
                <div class="trip-icon">${icon(getTransportIconName(trip.transport), 26, "icon icon-trip")}</div>
                <div class="trip-details">
                    <div class="trip-name">${escapeHtml(trip.transport)}</div>
                    <div class="trip-info">
                        <span>${parseTransactionDate(trip.date).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span>${escapeHtml(trip.location)}</span>
                    </div>
                </div>
                <div class="trip-amount">-${formatMoney(trip.amount)}</div>
            </div>`
            )
            .join("");
    }
}

function openRechargeModal() {
    document.getElementById("rechargeModal").classList.add("active");
    document.body.style.overflow = "hidden";
    updateBalance();
}

function closeRechargeModal() {
    document.getElementById("rechargeModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function selectAmount(amount, btn) {
    appState.selectedAmount = amount;
    document.getElementById("customAmount").value = "";
    document.querySelectorAll(".amount-btn").forEach((b) => b.classList.remove("selected"));
    if (btn) btn.classList.add("selected");
}

function confirmRecharge() {
    const customAmount = parseFloat(document.getElementById("customAmount").value);
    const amount = customAmount || appState.selectedAmount;
    const card = getActiveCard();

    if (isNaN(amount) || amount < 50 || amount > 5000) {
        showToast("Monto debe estar entre $50 y $5.000", "error", "x-circle");
        return;
    }

    const btn = event.target;
    const btnText = btn.textContent;
    btn.textContent = "Procesando...";
    btn.disabled = true;

    setTimeout(() => {
        card.balance += amount;
        const method =
            document.querySelector('input[name="payment"]:checked')?.value === "transfer"
                ? "Transferencia"
                : document.querySelector('input[name="payment"]:checked')?.value === "mercadopago"
                  ? "Mercado Pago"
                  : "Tarjeta";
        card.transactions.unshift({
            id: nextTxId(card),
            type: "recharge",
            amount,
            date: formatTransactionDate(new Date()),
            method,
        });
        refreshUI();
        showToast(`Recarga de ${formatMoney(amount)} exitosa. Nuevo saldo: ${formatMoney(card.balance)}`, "success", "check-circle");
        btn.textContent = btnText;
        btn.disabled = false;
        closeRechargeModal();
    }, 1200);
}

function openAdjustBalanceModal() {
    const card = getActiveCard();
    document.getElementById("adjustBalanceInput").value = card.balance;
    document.getElementById("adjustBalanceNote").value = "";
    document.getElementById("adjustBalanceModal").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeAdjustBalanceModal() {
    document.getElementById("adjustBalanceModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function confirmAdjustBalance() {
    const card = getActiveCard();
    const newBalance = parseFloat(document.getElementById("adjustBalanceInput").value);
    const note = document.getElementById("adjustBalanceNote").value.trim() || "Ajuste manual de saldo";

    if (isNaN(newBalance) || newBalance < 0 || newBalance > 99999) {
        showToast("Ingresá un saldo válido (0 - 99.999)", "error", "x-circle");
        return;
    }

    const diff = newBalance - card.balance;
    card.balance = newBalance;
    card.transactions.unshift({
        id: nextTxId(card),
        type: "adjust",
        amount: Math.abs(diff),
        date: formatTransactionDate(new Date()),
        note,
        direction: diff >= 0 ? "in" : "out",
    });
    refreshUI();
    closeAdjustBalanceModal();
    showToast(`Saldo actualizado a ${formatMoney(newBalance)}`, "success", "wallet");
}

function openHistory() {
    document.getElementById("historyModal").classList.add("active");
    document.body.style.overflow = "hidden";
    renderHistory();
}

function closeHistoryModal() {
    document.getElementById("historyModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function renderHistory() {
    const container = document.getElementById("historyContainer");
    const card = getActiveCard();
    let filtered = card.transactions;

    if (appState.currentFilter === "viajes") filtered = filtered.filter((t) => t.type === "trip");
    else if (appState.currentFilter === "recargas") filtered = filtered.filter((t) => t.type === "recharge" || t.type === "adjust");

    if (!filtered.length) {
        container.innerHTML = '<p class="empty-state">Sin movimientos</p>';
        return;
    }

    container.innerHTML = filtered
        .map((trans) => {
            const isRecharge = trans.type === "recharge";
            const isAdjust = trans.type === "adjust";
            let iconName = "credit-card";
            let title = "";
            let subtitle = "";
            let amountClass = "charge";
            let amountText = "";

            if (isRecharge) {
                iconName = "credit-card";
                title = `Recarga · ${trans.method}`;
                subtitle = trans.method;
                amountClass = "credit";
                amountText = `+${formatMoney(trans.amount)}`;
            } else if (isAdjust) {
                iconName = "pen-line";
                title = trans.direction === "out" ? "Ajuste de saldo" : "Saldo ingresado";
                subtitle = trans.note || "Ajuste manual";
                amountClass = trans.direction === "out" ? "charge" : "credit";
                amountText = trans.direction === "out" ? `-${formatMoney(trans.amount)}` : `+${formatMoney(trans.amount)}`;
            } else {
                iconName = getTransportIconName(trans.transport);
                title = trans.transport;
                subtitle = trans.location;
                amountText = `-${formatMoney(trans.amount)}`;
            }

            return `
                <div class="history-item ${isRecharge || (isAdjust && trans.direction !== "out") ? "recharge" : ""}">
                    <div class="history-date">${escapeHtml(trans.date)}</div>
                    <div class="history-details">
                        <div class="history-left">
                            <div class="history-icon">${icon(iconName, 20, "icon")}</div>
                            <div class="history-text">
                                <div class="history-type">${escapeHtml(title)}</div>
                                <div class="history-time">${escapeHtml(subtitle)}</div>
                            </div>
                        </div>
                        <div class="history-amount ${amountClass}">${amountText}</div>
                    </div>
                </div>`;
        })
        .join("");
}

function filterHistory(type, tabEl) {
    appState.currentFilter = type;
    document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.remove("active"));
    if (tabEl) tabEl.classList.add("active");
    renderHistory();
}

function openCardsModal() {
    renderCardsList();
    document.getElementById("cardsModal").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeCardsModal() {
    document.getElementById("cardsModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function renderCardsList() {
    const list = document.getElementById("cardsList");
    list.innerHTML = appState.cards
        .map((c) => {
            const active = c.id === appState.activeCardId;
            return `
            <button type="button" class="card-list-item ${active ? "active" : ""}" onclick="switchCard('${c.id}')">
                <div class="card-list-chip" style="background:linear-gradient(135deg,${c.color},${c.color}99)"></div>
                <div class="card-list-info">
                    <div class="card-list-name">${escapeHtml(c.name)}</div>
                    <div class="card-list-meta">${maskCardNumber(c.number)} · ${formatMoney(c.balance)}</div>
                </div>
                ${active ? icon("check", 20, "icon icon-check") : ""}
            </button>`;
        })
        .join("");
}

function switchCard(cardId) {
    if (!appState.cards.some((c) => c.id === cardId)) return;
    appState.activeCardId = cardId;
    appState.currentFilter = "all";
    document.querySelectorAll(".filter-tab").forEach((tab, i) => tab.classList.toggle("active", i === 0));
    refreshUI();
    closeCardsModal();
    const card = getActiveCard();
    showToast(`Tarjeta: ${card.name}`, "info", "layers");
}

function openAddCardForm() {
    document.getElementById("newCardName").value = "";
    document.getElementById("newCardNumber").value = "";
    document.getElementById("newCardBalance").value = "0";
    document.getElementById("addCardForm").classList.remove("hidden");
}

function confirmAddCard() {
    const name = document.getElementById("newCardName").value.trim() || "Nueva SUBE";
    const number = document.getElementById("newCardNumber").value.trim() || String(Math.floor(1000 + Math.random() * 9000));
    const balance = parseFloat(document.getElementById("newCardBalance").value) || 0;
    const colors = ["#0066CC", "#00AA44", "#FF9900", "#8B5CF6", "#DD3333"];
    const id = "card-" + Date.now();
    const card = {
        id,
        name,
        number,
        color: colors[appState.cards.length % colors.length],
        balance,
        alertsEnabled: false,
        transactions: balance > 0 ? [{ id: 1, type: "adjust", amount: balance, date: formatTransactionDate(new Date()), note: "Saldo inicial", direction: "in" }] : [],
    };
    appState.cards.push(card);
    appState.activeCardId = id;
    document.getElementById("addCardForm").classList.add("hidden");
    refreshUI();
    renderCardsList();
    showToast(`Tarjeta "${name}" agregada`, "success", "plus");
    persistState();
}

function openSettings() {
    document.getElementById("settingsModal").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeSettings() {
    document.getElementById("settingsModal").classList.remove("active");
    document.body.style.overflow = "auto";
}

function toggleDarkMode() {
    appState.darkMode = !appState.darkMode;
    document.body.classList.toggle("dark-mode", appState.darkMode);
    document.getElementById("darkModeToggle").classList.toggle("active", appState.darkMode);
    persistState();
    showToast(appState.darkMode ? "Modo oscuro activado" : "Modo claro activado", "success", appState.darkMode ? "moon" : "sun");
}

function loadDarkMode() {
    if (appState.darkMode) {
        document.body.classList.add("dark-mode");
        document.getElementById("darkModeToggle")?.classList.add("active");
    }
}

function showToast(message, variant = "success", iconName = "check-circle") {
    const notif = document.getElementById("successNotif");
    notif.className = "success-notification show toast-" + variant;
    notif.innerHTML = `${icon(iconName, 18, "icon icon-toast")}<span>${escapeHtml(message)}</span>`;
    void notif.offsetWidth;
    clearTimeout(notif._timer);
    notif._timer = setTimeout(() => notif.classList.remove("show"), 3200);
}

function showTripDetail(trip) {
    showToast(trip, "info", "map-pin");
}

function closeAllModals() {
    closeRechargeModal();
    closeHistoryModal();
    closeSettings();
    closeCardsModal();
    closeAdjustBalanceModal();
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
});

["rechargeModal", "historyModal", "settingsModal", "cardsModal", "adjustBalanceModal"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
            if (id === "rechargeModal") closeRechargeModal();
            else if (id === "historyModal") closeHistoryModal();
            else if (id === "settingsModal") closeSettings();
            else if (id === "cardsModal") closeCardsModal();
            else closeAdjustBalanceModal();
        }
    });
});
