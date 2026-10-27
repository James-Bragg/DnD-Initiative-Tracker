"use strict";

/* ==========================================================================
   D&D Tool Assister - Scripts
   --------------------------------------------------------------------------
   1. Constants
   2. Helpers
   3. Storage
   4. Navigation
   5. Initiative tracker
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initNav();

    if (document.getElementById("tracker")) {
        initTracker();
    }
});

/* 1. Constants
   ========================================================================== */

const STORAGE_KEY = "dndTool_state";
const LEGACY_PLAYERS_KEY = "dndTool_players";
const LEGACY_BONUSES_KEY = "dndTool_bonuses";
const MESSAGE_TIMEOUT_MS = 4000;

const DEFAULT_PLAYERS = [
    { name: "Enemy", bonus: 0 },
    { name: "Friend", bonus: 0 },
    { name: "Emma", bonus: 0 },
    { name: "Damian", bonus: 0 },
    { name: "Dom", bonus: 0 },
    { name: "Ryan", bonus: 0 },
    { name: "David", bonus: 0 },
    { name: "World", bonus: 0 },
    { name: "James", bonus: 0 },
];

/* 2. Helpers
   ========================================================================== */

function createId() {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toInteger(value, fallback = null) {
    const number = Number.parseInt(value, 10);
    return Number.isNaN(number) ? fallback : number;
}

function formatBonus(bonus) {
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
}

function getTotalText(player) {
    return player.roll === null ? "-" : String(player.roll + player.bonus);
}

function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

function pluralise(count, word) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function joinNames(names) {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

/** Small DOM builder: createElement("span", { className: "x", text: "y" }, [children]) */
function createElement(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    const { className, text, attrs = {}, dataset = {} } = options;

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
    Object.assign(element.dataset, dataset);
    children.forEach(child => element.append(child));

    return element;
}

/* 3. Storage
   ========================================================================== */

function createPlayer(name, bonus = 0, roll = null) {
    return { id: createId(), name, bonus, roll };
}

function createEmptyState() {
    return { players: [], order: [], turnIndex: 0, round: 1 };
}

function createDefaultState() {
    return {
        ...createEmptyState(),
        players: DEFAULT_PLAYERS.map(player => createPlayer(player.name, player.bonus)),
    };
}

/** Coerce stored data into a valid state so a bad save can't break the page. */
function sanitiseState(saved) {
    const players = saved.players
        .filter(player => player && typeof player.name === "string" && player.name.trim())
        .map(player => ({
            id: typeof player.id === "string" ? player.id : createId(),
            name: player.name.trim(),
            bonus: toInteger(player.bonus, 0),
            roll: toInteger(player.roll, null),
        }));

    const playerIds = new Set(players.map(player => player.id));
    const order = (Array.isArray(saved.order) ? saved.order : [])
        .map(group => ({
            total: toInteger(group.total, 0),
            ids: (Array.isArray(group.ids) ? group.ids : []).filter(id => playerIds.has(id)),
        }))
        .filter(group => group.ids.length > 0);

    return {
        players,
        order,
        turnIndex: Math.min(
            Math.max(toInteger(saved.turnIndex, 0), 0),
            Math.max(order.length - 1, 0),
        ),
        round: Math.max(toInteger(saved.round, 1), 1),
    };
}

/** Convert data saved by the previous version of the tracker. */
function loadLegacyState() {
    const names = JSON.parse(localStorage.getItem(LEGACY_PLAYERS_KEY));
    if (!Array.isArray(names) || names.length === 0) return null;

    const bonuses = JSON.parse(localStorage.getItem(LEGACY_BONUSES_KEY)) || {};
    return {
        ...createEmptyState(),
        players: names.map(name => createPlayer(name, toInteger(bonuses[name], 0))),
    };
}

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && Array.isArray(saved.players)) return sanitiseState(saved);

        const legacy = loadLegacyState();
        if (legacy) return legacy;
    } catch (error) {
        console.warn("Could not load saved tracker data.", error);
    }

    return createDefaultState();
}

function saveState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        localStorage.removeItem(LEGACY_PLAYERS_KEY);
        localStorage.removeItem(LEGACY_BONUSES_KEY);
    } catch (error) {
        console.warn("Could not save tracker data.", error);
    }
}

/* 4. Navigation
   ========================================================================== */

function initNav() {
    const toggle = document.querySelector(".nav__toggle");
    const menu = document.getElementById("navMenu");
    if (!toggle || !menu) return;

    const setOpen = isOpen => {
        menu.classList.toggle("is-open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
    };

    toggle.addEventListener("click", () => {
        setOpen(!menu.classList.contains("is-open"));
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && menu.classList.contains("is-open")) {
            setOpen(false);
            toggle.focus();
        }
    });

    document.addEventListener("click", event => {
        if (!menu.contains(event.target) && !toggle.contains(event.target)) {
            setOpen(false);
        }
    });
}

/* 5. Initiative tracker
   ========================================================================== */

function initTracker() {
    const el = {
        addPlayerForm: document.getElementById("addPlayerForm"),
        playerNameInput: document.getElementById("playerNameInput"),
        playerBonusInput: document.getElementById("playerBonusInput"),
        playerCount: document.getElementById("playerCount"),
        playersMessage: document.getElementById("playersMessage"),
        playersHint: document.getElementById("playersHint"),
        playerList: document.getElementById("playerList"),
        playersEmpty: document.getElementById("playersEmpty"),
        removeSelectedBtn: document.getElementById("removeSelectedBtn"),
        resetDefaultsBtn: document.getElementById("resetDefaultsBtn"),
        clearSessionBtn: document.getElementById("clearSessionBtn"),

        rollsHead: document.getElementById("rollsHead"),
        rollList: document.getElementById("rollList"),
        rollsEmpty: document.getElementById("rollsEmpty"),
        rollsMessage: document.getElementById("rollsMessage"),
        startCombatBtn: document.getElementById("startCombatBtn"),
        rollBlanksBtn: document.getElementById("rollBlanksBtn"),
        clearRollsBtn: document.getElementById("clearRollsBtn"),

        roundBadge: document.getElementById("roundBadge"),
        turnStatus: document.getElementById("turnStatus"),
        turnOrder: document.getElementById("turnOrder"),
        orderEmpty: document.getElementById("orderEmpty"),
        prevTurnBtn: document.getElementById("prevTurnBtn"),
        nextTurnBtn: document.getElementById("nextTurnBtn"),
    };

    let state = loadState();
    const selectedIds = new Set();
    const messageTimers = new WeakMap();

    // State helpers ---------------------------------------------------------

    const findPlayer = id => state.players.find(player => player.id === id);

    const isDuplicateName = name =>
        state.players.some(player => player.name.toLowerCase() === name.toLowerCase());

    const resetCombat = () => {
        state.order = [];
        state.turnIndex = 0;
        state.round = 1;
    };

    /** Drop removed players from the turn order and keep the turn pointer valid. */
    const pruneOrder = () => {
        const ids = new Set(state.players.map(player => player.id));
        state.order = state.order
            .map(group => ({ ...group, ids: group.ids.filter(id => ids.has(id)) }))
            .filter(group => group.ids.length > 0);

        if (state.order.length === 0) {
            resetCombat();
        } else if (state.turnIndex >= state.order.length) {
            state.turnIndex = 0;
        }
    };

    const commit = () => {
        saveState(state);
        render();
    };

    const showMessage = (target, text, tone = "info") => {
        clearTimeout(messageTimers.get(target));
        target.textContent = text;
        target.dataset.tone = tone;
        messageTimers.set(
            target,
            setTimeout(() => {
                target.textContent = "";
            }, MESSAGE_TIMEOUT_MS),
        );
    };

    // Rendering -------------------------------------------------------------

    const renderPlayers = () => {
        const hasPlayers = state.players.length > 0;

        el.playerCount.textContent = pluralise(state.players.length, "player");
        el.playersEmpty.hidden = hasPlayers;
        el.playersHint.hidden = !hasPlayers;

        el.playerList.replaceChildren(
            ...state.players.map(player =>
                createElement("li", {}, [
                    createElement(
                        "button",
                        {
                            className: "player-chip",
                            attrs: {
                                type: "button",
                                "aria-pressed": String(selectedIds.has(player.id)),
                            },
                            dataset: { playerId: player.id },
                        },
                        [
                            createElement("span", { text: player.name }),
                            createElement("span", {
                                className: "player-chip__bonus",
                                text: formatBonus(player.bonus),
                            }),
                        ],
                    ),
                ]),
            ),
        );
    };

    const renderRolls = () => {
        const hasPlayers = state.players.length > 0;

        el.rollsHead.hidden = !hasPlayers;
        el.rollsEmpty.hidden = hasPlayers;

        el.rollList.replaceChildren(
            ...state.players.map(player =>
                createElement("li", { className: "roll-row", dataset: { playerId: player.id } }, [
                    createElement("span", {
                        className: "roll-row__name",
                        text: player.name,
                        attrs: { title: player.name },
                    }),
                    createElement("input", {
                        className: "input input--narrow",
                        attrs: {
                            type: "number",
                            inputmode: "numeric",
                            min: "1",
                            max: "30",
                            placeholder: "-",
                            autocomplete: "off",
                            "aria-label": `${player.name} initiative roll`,
                            value: player.roll ?? "",
                        },
                        dataset: { field: "roll" },
                    }),
                    createElement("input", {
                        className: "input input--narrow",
                        attrs: {
                            type: "number",
                            inputmode: "numeric",
                            placeholder: "+0",
                            autocomplete: "off",
                            "aria-label": `${player.name} initiative bonus`,
                            value: player.bonus,
                        },
                        dataset: { field: "bonus" },
                    }),
                    createElement("span", {
                        className: "roll-row__total",
                        text: getTotalText(player),
                    }),
                ]),
            ),
        );
    };

    const renderOrder = () => {
        const inCombat = state.order.length > 0;

        el.orderEmpty.hidden = inCombat;
        el.roundBadge.hidden = !inCombat;
        el.roundBadge.textContent = `Round ${state.round}`;

        if (inCombat) {
            const currentNames = state.order[state.turnIndex].ids.map(id => findPlayer(id).name);
            el.turnStatus.replaceChildren(
                "Current turn: ",
                createElement("strong", { text: joinNames(currentNames) }),
            );
        } else {
            el.turnStatus.textContent = "Combat has not started.";
        }

        const cards = state.order.flatMap((group, groupIndex) =>
            group.ids.map(id => {
                const isCurrent = groupIndex === state.turnIndex;
                return createElement(
                    "li",
                    {
                        className: `turn-card${isCurrent ? " is-current" : ""}`,
                        attrs: isCurrent ? { "aria-current": "step" } : {},
                    },
                    [
                        createElement("span", {
                            className: "turn-card__position",
                            text: `#${groupIndex + 1}`,
                        }),
                        createElement("span", {
                            className: "turn-card__total",
                            text: String(group.total),
                        }),
                        createElement("span", {
                            className: "turn-card__name",
                            text: findPlayer(id).name,
                        }),
                    ],
                );
            }),
        );
        el.turnOrder.replaceChildren(...cards);
    };

    const renderControls = () => {
        const hasPlayers = state.players.length > 0;
        const inCombat = state.order.length > 0;
        const hasRolls = state.players.some(player => player.roll !== null);

        el.removeSelectedBtn.disabled = selectedIds.size === 0;
        el.clearSessionBtn.disabled = !hasPlayers;
        el.startCombatBtn.disabled = !hasRolls;
        el.rollBlanksBtn.disabled = !state.players.some(player => player.roll === null);
        el.clearRollsBtn.disabled = !hasRolls && !inCombat;
        el.prevTurnBtn.disabled = !inCombat || (state.round === 1 && state.turnIndex === 0);
        el.nextTurnBtn.disabled = !inCombat;
    };

    const render = () => {
        renderPlayers();
        renderRolls();
        renderOrder();
        renderControls();
    };

    // Session players -------------------------------------------------------

    el.addPlayerForm.addEventListener("submit", event => {
        event.preventDefault();

        const name = el.playerNameInput.value.trim();
        const bonus = toInteger(el.playerBonusInput.value, 0);

        if (!name) {
            el.playerNameInput.setAttribute("aria-invalid", "true");
            showMessage(el.playersMessage, "Enter a player name.", "error");
            el.playerNameInput.focus();
            return;
        }

        if (isDuplicateName(name)) {
            el.playerNameInput.setAttribute("aria-invalid", "true");
            showMessage(el.playersMessage, `"${name}" is already in the session.`, "error");
            el.playerNameInput.focus();
            return;
        }

        state.players.push(createPlayer(name, bonus));
        el.addPlayerForm.reset();
        el.playerNameInput.removeAttribute("aria-invalid");
        el.playerNameInput.focus();
        showMessage(el.playersMessage, `Added ${name}.`, "success");
        commit();
    });

    el.playerNameInput.addEventListener("input", () => {
        el.playerNameInput.removeAttribute("aria-invalid");
    });

    el.playerList.addEventListener("click", event => {
        const chip = event.target.closest("[data-player-id]");
        if (!chip) return;

        const { playerId } = chip.dataset;
        if (selectedIds.has(playerId)) {
            selectedIds.delete(playerId);
        } else {
            selectedIds.add(playerId);
        }

        chip.setAttribute("aria-pressed", String(selectedIds.has(playerId)));
        renderControls();
    });

    el.removeSelectedBtn.addEventListener("click", () => {
        const count = selectedIds.size;
        state.players = state.players.filter(player => !selectedIds.has(player.id));
        selectedIds.clear();
        pruneOrder();
        showMessage(el.playersMessage, `Removed ${pluralise(count, "player")}.`, "success");
        commit();
    });

    el.resetDefaultsBtn.addEventListener("click", () => {
        if (!confirm("Replace the current session with the default players?")) return;

        state = createDefaultState();
        selectedIds.clear();
        showMessage(el.playersMessage, "Loaded the default players.", "success");
        commit();
    });

    el.clearSessionBtn.addEventListener("click", () => {
        if (!confirm("Clear all players and rolls from the session? This cannot be undone.")) {
            return;
        }

        state = createEmptyState();
        selectedIds.clear();
        commit();
    });

    // Initiative rolls ------------------------------------------------------

    // Typing updates state in place; re-rendering the inputs would steal focus.
    el.rollList.addEventListener("input", event => {
        const input = event.target;
        const row = input.closest("[data-player-id]");
        const player = row && findPlayer(row.dataset.playerId);
        if (!player) return;

        if (input.dataset.field === "roll") {
            player.roll = toInteger(input.value, null);
        } else if (input.dataset.field === "bonus") {
            player.bonus = toInteger(input.value, 0);
            renderPlayers();
        }

        row.querySelector(".roll-row__total").textContent = getTotalText(player);
        saveState(state);
        renderControls();
    });

    el.rollBlanksBtn.addEventListener("click", () => {
        const blanks = state.players.filter(player => player.roll === null);
        blanks.forEach(player => {
            player.roll = rollD20();
        });

        showMessage(
            el.rollsMessage,
            `Rolled a d20 for ${pluralise(blanks.length, "player")}.`,
            "success",
        );
        commit();
    });

    el.clearRollsBtn.addEventListener("click", () => {
        state.players.forEach(player => {
            player.roll = null;
        });
        resetCombat();
        commit();
    });

    el.startCombatBtn.addEventListener("click", () => {
        const entries = state.players
            .filter(player => player.roll !== null)
            .map(player => ({ id: player.id, total: player.roll + player.bonus }))
            .sort((a, b) => b.total - a.total);

        if (entries.length === 0) {
            showMessage(
                el.rollsMessage,
                "Enter or roll at least one initiative value first.",
                "error",
            );
            return;
        }

        // Players with the same total share a turn
        state.order = [];
        entries.forEach(entry => {
            const lastGroup = state.order.at(-1);
            if (lastGroup && lastGroup.total === entry.total) {
                lastGroup.ids.push(entry.id);
            } else {
                state.order.push({ total: entry.total, ids: [entry.id] });
            }
        });
        state.turnIndex = 0;
        state.round = 1;

        const skipped = state.players.length - entries.length;
        if (skipped > 0) {
            showMessage(
                el.rollsMessage,
                `${pluralise(skipped, "player")} without a roll left out of the order.`,
            );
        }
        commit();
    });

    // Initiative order ------------------------------------------------------

    const stepTurn = direction => {
        const groupCount = state.order.length;
        if (groupCount === 0) return;

        let nextIndex = state.turnIndex + direction;

        if (nextIndex >= groupCount) {
            nextIndex = 0;
            state.round += 1;
        } else if (nextIndex < 0) {
            if (state.round === 1) return;
            nextIndex = groupCount - 1;
            state.round -= 1;
        }

        state.turnIndex = nextIndex;
        commit();
    };

    el.prevTurnBtn.addEventListener("click", () => stepTurn(-1));
    el.nextTurnBtn.addEventListener("click", () => stepTurn(1));

    render();
}
