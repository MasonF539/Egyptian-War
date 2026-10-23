const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const gameDirectory = path.resolve(__dirname, "..");
const storageKey = "egyptian-war:layout";

function mountClient({ narrow = false, shortLandscape = false, saved, blockedStorage = false, input, display, host = false, actions = {}, resetScoreboard = async () => ({ success: true }) } = {}) {
  const dom = new JSDOM(readFileSync(path.join(gameDirectory, "public/template.html"), "utf8"), {
    url: "http://localhost", runScripts: "outside-only"
  });
  const { window } = dom;
  window.matchMedia = (query) => ({ matches: narrow || (shortLandscape && query.includes("orientation: landscape")) });
  if (saved !== undefined) window.localStorage.setItem(storageKey, saved);
  if (blockedStorage) {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage disabled"); } });
  }
  let gameModule;
  let resetHandler;
  const resetButton = window.document.getElementById("egyptian-war-reset-scores");
  const addResetListener = resetButton.addEventListener.bind(resetButton);
  resetButton.addEventListener = (type, handler, ...options) => {
    if (type === "click") resetHandler = handler;
    addResetListener(type, handler, ...options);
  };
  window.GameHubRegisterGameClientModule = (_id, module) => { gameModule = module; };
  window.eval(readFileSync(path.join(gameDirectory, "public/client.js"), "utf8"));
  const instance = gameModule.mount({
    root: window.document.body, input, display,
    memberId: "me", get isHost() { return host; }, role: "player",
    resetScoreboard,
    launchData: { settings: {}, chatEnabled: true },
    audio: { setScene() {}, playEffect() {} },
    ...actions
  });
  return {
    window, instance,
    resetScores: () => resetHandler(),
    setHost(value) { host = value; },
    el: (id) => window.document.getElementById(id),
    saved: () => window.localStorage.getItem(storageKey),
    close() { instance.destroy(); window.close(); }
  };
}

test("phones start with chat minimized and slap rules collapsed", () => {
  const view = mountClient({ narrow: true });
  try {
    assert.equal(view.el("egyptian-war-side-panel").hidden, true);
    assert.equal(view.el("open-game-side-panel").hidden, false);
    assert.equal(view.el("toggle-slap-rules").getAttribute("aria-expanded"), "false");
    assert.equal(view.el("egyptian-war-slap-rules-list").hidden, true);
  } finally { view.close(); }
});

test("button hints follow keyboard availability and remapping, while themes remain personal", () => {
  let keyboard = true;
  let binding = "E";
  let bindingChanged;
  let displayChanged;
  const preferences = { cardStyle: "midnight", tableColor: "blue" };
  const view = mountClient({ input: {
    onAction: () => () => {},
    hasKeyboard: () => keyboard,
    getBinding: (action) => action === "slap" ? "Space" : binding,
    onBindingsChanged: (handler) => { bindingChanged = handler; return () => { bindingChanged = null; }; }
  }, display: {
    get: (key) => preferences[key],
    onChange: (handler) => { displayChanged = handler; return () => { displayChanged = null; }; }
  } });
  try {
    assert.equal(view.el("egyptian-war-play-key").textContent, "E");
    assert.equal(view.el("egyptian-war-slap-key").textContent, "Space");
    assert.equal(view.el("egyptian-war-slap-subtitle").hidden, true);
    binding = "Q";
    bindingChanged();
    assert.equal(view.el("egyptian-war-play-key").textContent, "Q");
    keyboard = false;
    bindingChanged();
    assert.equal(view.el("egyptian-war-play-key").hidden, true);
    assert.equal(view.el("egyptian-war-slap-subtitle").hidden, false);
    assert.equal(view.window.document.body.dataset.cardStyle, "midnight");
    preferences.tableColor = "burgundy";
    displayChanged();
    assert.equal(view.window.document.body.dataset.tableColor, "burgundy");
  } finally { view.close(); }
  assert.equal(bindingChanged, null);
  assert.equal(displayChanged, null);
});

test("panel size, minimized state, and rules survive a fresh page", () => {
  const first = mountClient();
  let saved;
  try {
    first.el("toggle-game-side-panel").click();
    first.el("minimize-game-side-panel").click();
    first.el("toggle-slap-rules").click();
    saved = first.saved();
  } finally { first.close(); }
  const second = mountClient({ saved });
  try {
    assert.equal(second.el("egyptian-war-side-panel").hidden, true);
    assert.equal(second.el("egyptian-war-slap-rules-list").hidden, true);
    second.el("open-game-side-panel").click();
    assert.equal(second.el("egyptian-war-side-panel").classList.contains("is-expanded"), true);
    assert.equal(second.el("egyptian-war-side-panel").hidden, false);
  } finally { second.close(); }
});

test("invalid or unavailable storage preserves working layout controls", () => {
  for (const options of [{ saved: "broken" }, { saved: '{"panelMode":"invalid","rulesExpanded":0}' }, { blockedStorage: true }]) {
    const view = mountClient({ narrow: true, ...options });
    try {
      assert.equal(view.el("egyptian-war-side-panel").hidden, true);
      view.el("open-game-side-panel").click();
      assert.equal(view.el("egyptian-war-side-panel").hidden, false);
      view.el("toggle-slap-rules").click();
      assert.equal(view.el("egyptian-war-slap-rules-list").hidden, false);
    } finally { view.close(); }
  }
});

test("restored chat does not count as unread and message text stays escaped", () => {
  const view = mountClient({ narrow: true });
  try {
    view.instance.receivePlatformEvent({ type: "chat-message", payload: {
      senderId: "other", senderName: "Guest", message: "<img src=x onerror=alert(1)>", isHistory: true
    } });
    assert.equal(view.el("egyptian-war-chat-badge").hidden, true);
    assert.equal(view.el("egyptian-war-chat-messages").querySelector("img"), null);
    view.instance.receivePlatformEvent({ type: "chat-message", payload: {
      senderId: "other", senderName: "Guest", message: "New message"
    } });
    assert.equal(view.el("egyptian-war-chat-badge").textContent, "1");
  } finally { view.close(); }
});

test("the turn label flows below the seat area and above the timer", () => {
  const view = mountClient();
  try {
    const arena = view.el("egyptian-war-arena");
    const turn = view.el("egyptian-war-turn");
    const timer = view.el("egyptian-war-turn-timer");
    assert.equal(arena.nextElementSibling.contains(turn), true);
    assert.equal(turn.nextElementSibling, timer);
    assert.equal(arena.contains(turn), false);
    assert.equal(turn.getAttribute("aria-live"), "polite");
    assert.equal(turn.getAttribute("aria-atomic"), "true");
  } finally { view.close(); }
});

test("turn announcements distinguish your turn, another player, pause, and completion", () => {
  const view = mountClient();
  const state = {
    status: "playing", players: [
      { id: "me", name: "Me", isConnected: true, cardCount: 26 },
      { id: "guest", name: "Guest", isConnected: true, cardCount: 26 }
    ], currentPlayerId: "me", recentCards: [], winnerId: null,
    isPaused: false, isAnimating: false, turnTimerSeconds: 15,
    turnTimeRemainingMs: 15000, challenge: null, pileCardCount: 0,
    hasFaceUpCards: false, activityMessage: "", canPlayCard: true
  };
  try {
    const turn = view.el("egyptian-war-turn");
    view.instance.receiveState(state);
    assert.equal(turn.textContent, "It's your turn");
    const announcements = new view.window.MutationObserver(() => {});
    announcements.observe(turn, { childList: true, characterData: true, subtree: true });
    view.instance.receiveState({ ...state, turnTimeRemainingMs: 14000 });
    assert.equal(announcements.takeRecords().length, 0, "An unchanged turn must not rewrite its live announcement");
    announcements.disconnect();
    view.instance.receiveState({ ...state, currentPlayerId: "guest" });
    assert.equal(turn.textContent, "Guest's turn");
    view.instance.receiveState({ ...state, isPaused: true, pauseMessage: "Waiting for Guest to reconnect" });
    assert.equal(turn.textContent, "Waiting for Guest to reconnect");
    view.instance.receiveState({ ...state, status: "finished", winnerId: "guest" });
    assert.equal(turn.textContent, "Guest wins!");
  } finally { view.close(); }
});

test("player seats keep their DOM identity and focus while counts and connection state change", () => {
  const view = mountClient();
  const state = { status: "playing", players: [
    { id: "me", name: "Me", avatar: "M", isConnected: true, cardCount: 26 },
    { id: "guest", name: "Guest", avatar: "G", isConnected: true, cardCount: 26 }
  ], currentPlayerId: "me", recentCards: [], winnerId: null, isPaused: false,
    isAnimating: false, turnTimerSeconds: 15, turnTimeRemainingMs: 15000,
    challenge: null, pileCardCount: 0, hasFaceUpCards: false, activityMessage: "", canPlayCard: true };
  try {
    view.instance.receiveState(state);
    const seat = view.el("egyptian-war-players").firstElementChild;
    const name = seat.querySelector(".player-name");
    name.tabIndex = 0; name.focus();
    view.instance.receiveState({ ...state, players: [{ ...state.players[0], cardCount: 25, isConnected: false }, state.players[1]] });
    assert.equal(view.el("egyptian-war-players").firstElementChild, seat);
    assert.equal(view.window.document.activeElement, name);
    assert.equal(seat.querySelector(".egyptian-war-card-count").textContent, "25 cards");
    assert.ok(seat.querySelector(".egyptian-war-disconnected-actions"));
    view.instance.receiveState(state);
    assert.equal(seat.querySelector(".egyptian-war-disconnected-actions"), null);
    view.instance.receiveState({ ...state, players: [state.players[1]] });
    assert.equal(seat.isConnected, false);
  } finally { view.close(); }
});

test("scoreboard tab, reconnect countdowns and live host controls remain usable", () => {
  const view = mountClient({ narrow: true });
  const state = { status: "playing", players: [
    { id: "me", name: "Me", avatar: "M", isConnected: true, cardCount: 26 },
    { id: "guest", name: "Guest", avatar: "G", isConnected: false, cardCount: 26 }
  ], currentPlayerId: "me", recentCards: [], winnerId: null, isPaused: true,
    isAnimating: false, turnTimerSeconds: 15, turnTimeRemainingMs: 15000,
    challenge: null, pileCardCount: 0, hasFaceUpCards: false, activityMessage: "", canPlayCard: false,
    serverNow: 100000, offlinePlayers: [{ id: "guest", name: "Guest", autoPlayAt: 160000, autoPlaying: false }] };
  try {
    view.instance.receiveState(state);
    assert.match(view.el("egyptian-war-offline-status").textContent, /Paused.*Guest: auto-play in 60s/);
    view.instance.receiveState({ ...state, serverNow: 101000 });
    assert.match(view.el("egyptian-war-offline-status").textContent, /59s/);
    view.instance.receivePlatformEvent({ type: "scoreboard", payload: {
      columns: [{ key: "wins", label: "Wins" }], rows: [{ name: "<img src=x>", avatar: "G", values: { wins: 2 } }]
    } });
    view.el("show-game-scoreboard").click();
    assert.equal(view.el("egyptian-war-scoreboard").hidden, false);
    assert.equal(view.el("egyptian-war-chat").hidden, true);
    assert.equal(view.el("egyptian-war-score-table").querySelector("img"), null);
    assert.match(view.el("egyptian-war-score-table").textContent, /2/);
    view.el("show-game-scoreboard").dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    assert.equal(view.el("show-game-spectators").getAttribute("aria-selected"), "true");
    view.el("show-game-spectators").dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
    assert.equal(view.el("show-game-scoreboard").getAttribute("aria-selected"), "true");
    view.setHost(true);
    view.instance.receivePlatformEvent({ type: "host-changed", payload: { isHost: true } });
    assert.equal(view.el("egyptian-war-host-controls").classList.contains("d-none"), false);
    assert.equal(view.el("egyptian-war-reset-scores").hidden, false);
    assert.ok(view.el("egyptian-war-players").querySelector("button"));
    view.setHost(false);
    view.instance.receivePlatformEvent({ type: "host-changed", payload: { isHost: false } });
    assert.equal(view.el("egyptian-war-players").querySelector("button"), null);
    assert.equal(view.el("egyptian-war-reset-scores").hidden, true);
  } finally { view.close(); }
});


test("a failed reset reply after unmount does not notify through a destroyed context", async () => {
  let finishReset;
  const view = mountClient({ host: true, resetScoreboard: () => new Promise(resolve => { finishReset = resolve; }) });
  const pending = view.resetScores();
  view.instance.destroy();
  finishReset({ success: false, message: "Room closed" });
  try { await assert.doesNotReject(pending); }
  finally { view.window.close(); }
});


test("eight seats use flat rectangle edges in clockwise order and retain equal oval angles", () => {
  const view = mountClient();
  const state = {
    status: "playing", players: Array.from({ length: 8 }, (_, index) => ({
      id: `p${index}`, name: `Player ${index}`, avatar: "P", isConnected: true, cardCount: 7
    })), currentPlayerId: "p0", recentCards: [], winnerId: null,
    isPaused: false, isAnimating: false, turnTimerSeconds: 15,
    turnTimeRemainingMs: 15000, challenge: null, pileCardCount: 0,
    hasFaceUpCards: false, activityMessage: "", canPlayCard: false
  };
  try {
    for (let count = 2; count <= 8; count++) {
      view.instance.receiveState({ ...state, players: state.players.slice(0, count) });
      const seats = [...view.el("egyptian-war-players").children];
      const position = seat => ({
        x: parseFloat(seat.style.getPropertyValue("--rectangle-seat-x")),
        y: parseFloat(seat.style.getPropertyValue("--rectangle-seat-y"))
      });
      const rectangle = seats.map(position);
      assert.equal(rectangle.filter(point => point.x === 50 && point.y === 10).length, 1);
      assert.equal(rectangle.filter(point => point.x === 50 && point.y === 88).length, 1);
      assert.equal(rectangle.filter(point => point.x !== 50).length, count - 2);
      for (const point of rectangle.filter(point => point.x !== 50)) {
        assert.ok(point.x === 18 || point.x === 82);
        assert.ok(point.y > 10 && point.y < 88, "Side seats must avoid corners");
      }
      const right = rectangle.filter(point => point.x === 82);
      const left = rectangle.filter(point => point.x === 18);
      assert.deepEqual(right.map(point => point.y), right.map(point => point.y).sort((a, b) => a - b));
      assert.deepEqual(left.map(point => point.y), left.map(point => point.y).sort((a, b) => b - a));
      if (count === 8) { assert.equal(right.length, 3); assert.equal(left.length, 3); }
      const angles = seats.map(seat => Math.atan2(
        (parseFloat(seat.style.getPropertyValue("--oval-seat-y")) - 50) / 37,
        (parseFloat(seat.style.getPropertyValue("--oval-seat-x")) - 50) / 40
      ));
      for (let index = 0; index < count; index++) {
        const gap = (angles[(index + 1) % count] - angles[index] + 2 * Math.PI) % (2 * Math.PI);
        assert.ok(Math.abs(gap - 2 * Math.PI / count) < 1e-10);
      }
    }
  } finally { view.close(); }
});


test("new activity and challenges reset scrolling while unchanged snapshots preserve it", () => {
  const view = mountClient();
  const state = { status: "playing", players: [
    { id: "me", name: "Me", avatar: "M", isConnected: true, cardCount: 26 },
    { id: "guest", name: "Guest", avatar: "G", isConnected: true, cardCount: 26 }
  ], currentPlayerId: "me", recentCards: [], winnerId: null, isPaused: false,
    isAnimating: false, turnTimerSeconds: 15, turnTimeRemainingMs: 15000,
    challenge: null, pileCardCount: 0, hasFaceUpCards: false,
    activityMessage: "Previous activity", canPlayCard: true };
  try {
    const updates = view.window.document.querySelector(".egyptian-war-table-updates");
    view.instance.receiveState(state);
    updates.scrollTop = 30;
    view.instance.receiveState({ ...state, turnTimeRemainingMs: 14000 });
    assert.equal(updates.scrollTop, 30);
    view.instance.receiveState({ ...state, activityMessage: "New activity" });
    assert.equal(updates.scrollTop, 0);
    updates.scrollTop = 30;
    const challenge = { challengerId: "me", responderId: "guest", attemptsRemaining: 2 };
    view.instance.receiveState({ ...state, activityMessage: "New activity", challenge });
    assert.equal(updates.scrollTop, 0);
    updates.scrollTop = 30;
    view.instance.receiveState({ ...state, activityMessage: "New activity", challenge });
    assert.equal(updates.scrollTop, 30);
  } finally { view.close(); }
});


test("short landscape starts rules collapsed while respecting an explicit saved choice", () => {
  for (const saved of [undefined, JSON.stringify({ rulesExpanded: true })]) {
    const view = mountClient({ shortLandscape: true, saved });
    try {
      assert.equal(view.el("toggle-slap-rules").getAttribute("aria-expanded"), String(saved !== undefined));
    } finally { view.close(); }
  }
});


for (const action of ["play", "slap", "pause", "kick", "chat"]) {
  test(`a delayed ${action} reply is ignored after the game unmounts`, async () => {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const notices = [];
    const view = mountClient({ host: true, actions: {
      submitAction: () => pending, requestPause: () => pending,
      removeMember: () => pending, sendChat: () => pending,
      notify: message => notices.push(message)
    } });
    const state = { status: "playing", players: [
      { id: "me", name: "Me", avatar: "M", isConnected: true, cardCount: 26 },
      { id: "guest", name: "Guest", avatar: "G", isConnected: false, cardCount: 26 }
    ], currentPlayerId: "me", recentCards: [], winnerId: null, isPaused: false,
      isAnimating: false, turnTimerSeconds: 15, turnTimeRemainingMs: 15000,
      challenge: null, pileCardCount: 1, hasFaceUpCards: true,
      activityMessage: "", canPlayCard: true };
    try {
      view.instance.receiveState(state);
      if (action === "chat") {
        view.el("egyptian-war-chat-input").value = "Previous game";
        view.el("egyptian-war-chat-form").dispatchEvent(new view.window.Event("submit", { cancelable: true }));
      } else if (action === "kick") {
        view.window.document.querySelector('[aria-label="Kick Guest"]').click();
      } else {
        const id = { play: "play-card", slap: "slap", pause: "pause" }[action];
        const button = view.el(`egyptian-war-${id}`);
        assert.equal(button.disabled, false);
        button.click();
      }
      view.instance.destroy();
      resolve({ success: false, message: "Old response" });
      await new Promise(done => setImmediate(done));
      assert.deepEqual(notices, []);
    } finally { view.close(); }
  });
}
