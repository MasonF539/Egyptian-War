const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const gameDirectory = path.resolve(__dirname, "..");
const storageKey = "egyptian-war:layout";

function mountClient({ narrow = false, saved, blockedStorage = false } = {}) {
  const dom = new JSDOM(readFileSync(path.join(gameDirectory, "public/template.html"), "utf8"), {
    url: "http://localhost", runScripts: "outside-only"
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: narrow });
  if (saved !== undefined) window.localStorage.setItem(storageKey, saved);
  if (blockedStorage) {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage disabled"); } });
  }
  let gameModule;
  window.GameHubRegisterGameClientModule = (_id, module) => { gameModule = module; };
  window.eval(readFileSync(path.join(gameDirectory, "public/client.js"), "utf8"));
  const instance = gameModule.mount({
    memberId: "me", isHost: false, role: "player",
    launchData: { settings: {}, chatEnabled: true },
    audio: { setScene() {}, playEffect() {} }
  });
  return {
    window, instance,
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
    view.instance.receiveState({ ...state, currentPlayerId: "guest" });
    assert.equal(turn.textContent, "Guest's turn");
    view.instance.receiveState({ ...state, isPaused: true, pauseMessage: "Waiting for Guest to reconnect" });
    assert.equal(turn.textContent, "Waiting for Guest to reconnect");
    view.instance.receiveState({ ...state, status: "finished", winnerId: "guest" });
    assert.equal(turn.textContent, "Guest wins!");
  } finally { view.close(); }
});
