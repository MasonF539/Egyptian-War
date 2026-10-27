(function initializeEgyptianWarClient(globalScope) {
let currentContext = null;
let currentSettings = {};
let timerInterval = null;

const egyptianWarRoot =
  document.querySelector('[data-game-plugin-root="egyptian-war"]') ?? document;
const findEgyptianWarElement = (selector) => egyptianWarRoot.querySelector(selector);
const egyptianWarTurn = findEgyptianWarElement("#egyptian-war-turn");
const egyptianWarTurnTimer = findEgyptianWarElement("#egyptian-war-turn-timer");
const egyptianWarTurnTimerBar = findEgyptianWarElement("#egyptian-war-turn-timer-bar");
const egyptianWarTurnTimerValue = findEgyptianWarElement("#egyptian-war-turn-timer-value");
const egyptianWarChallenge = findEgyptianWarElement("#egyptian-war-challenge");
const egyptianWarPileCount = findEgyptianWarElement("#egyptian-war-pile-count");
const egyptianWarTopCard = findEgyptianWarElement("#egyptian-war-top-card");
const egyptianWarPlayers = findEgyptianWarElement("#egyptian-war-players");
const egyptianWarArena = findEgyptianWarElement("#egyptian-war-arena");
const egyptianWarPileStack = findEgyptianWarElement("#egyptian-war-pile-stack");
const egyptianWarPlayCardButton = findEgyptianWarElement("#egyptian-war-play-card");
const egyptianWarSlapButton = findEgyptianWarElement("#egyptian-war-slap");
const egyptianWarPauseButton = findEgyptianWarElement("#egyptian-war-pause");
const egyptianWarHostControls = findEgyptianWarElement("#egyptian-war-host-controls");
const egyptianWarSlapRulesList = findEgyptianWarElement("#egyptian-war-slap-rules-list");
const toggleSlapRulesButton = findEgyptianWarElement("#toggle-slap-rules");
const egyptianWarMessage = findEgyptianWarElement("#egyptian-war-message");
const egyptianWarVictory = findEgyptianWarElement("#egyptian-war-victory");
const egyptianWarAnimationLayer = findEgyptianWarElement("#egyptian-war-animation-layer");
const egyptianWarChat = findEgyptianWarElement("#egyptian-war-chat");
const egyptianWarChatForm = findEgyptianWarElement("#egyptian-war-chat-form");
const egyptianWarChatInput = findEgyptianWarElement("#egyptian-war-chat-input");
const egyptianWarChatMessages = findEgyptianWarElement("#egyptian-war-chat-messages");
const egyptianWarSpectators = findEgyptianWarElement("#egyptian-war-spectators");
const egyptianWarSpectatorList = findEgyptianWarElement("#egyptian-war-spectator-list");
const showGameChatButton = findEgyptianWarElement("#show-game-chat");
const showGameSpectatorsButton = findEgyptianWarElement("#show-game-spectators");
const toggleGameSidePanelButton = findEgyptianWarElement("#toggle-game-side-panel");
const egyptianWarSidePanel = findEgyptianWarElement(".egyptian-war-side-panel");
const openGameSidePanelButton = findEgyptianWarElement("#open-game-side-panel");
const minimizeGameSidePanelButton = findEgyptianWarElement("#minimize-game-side-panel");
const egyptianWarChatBadge = findEgyptianWarElement("#egyptian-war-chat-badge");

// The side panel is a circle button ("closed"), a medium panel (the default)
// or a large panel. Minimizing remembers which open size to come back to.
let egyptianWarSidePanelMode = "medium";
let egyptianWarSidePanelReopenMode = "medium";
let egyptianWarUnreadChatCount = 0;

const layoutStorageKey = "egyptian-war:layout";
function readLayoutPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(layoutStorageKey) ?? "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function saveLayoutPreferences() {
  try {
    localStorage.setItem(layoutStorageKey, JSON.stringify({
      panelMode: egyptianWarSidePanelMode,
      reopenMode: egyptianWarSidePanelReopenMode,
      rulesExpanded: toggleSlapRulesButton.getAttribute("aria-expanded") === "true"
    }));
  } catch {
    // Layout controls still work when storage is unavailable.
  }
}

function setSlapRulesExpanded(expanded) {
  toggleSlapRulesButton.setAttribute("aria-expanded", String(expanded));
  toggleSlapRulesButton.textContent = expanded ? "Hide" : "Show";
  egyptianWarSlapRulesList.hidden = !expanded;
  egyptianWarSlapRulesList.parentElement.classList.toggle("is-collapsed", !expanded);
  fitEgyptianWarTableContent();
}

function restoreLayoutPreferences() {
  const saved = readLayoutPreferences();
  const narrow = globalScope.matchMedia?.("(max-width: 575.98px)").matches === true;
  const shortLandscape = globalScope.matchMedia?.("(max-height: 500px) and (orientation: landscape)").matches === true;
  egyptianWarSidePanelReopenMode = saved.reopenMode === "large" ? "large" : "medium";
  setSlapRulesExpanded(typeof saved.rulesExpanded === "boolean" ? saved.rulesExpanded : !(narrow || shortLandscape));
  const mode = ["closed", "medium", "large"].includes(saved.panelMode)
    ? saved.panelMode : narrow ? "closed" : "medium";
  setEgyptianWarSidePanelMode(mode);
}

let previousEgyptianWarState = null;
let visibleEgyptianWarCards = [];
let activeEgyptianWarAnimation = null;
let lastEgyptianWarAnimationId = 0;
let egyptianWarAnimationTimeout = null;
let egyptianWarTransferTimeout = null;
let egyptianWarWinnerRevealTimeout = null;
let egyptianWarSoundTimeouts = [];
let revealedEgyptianWarWinnerAnimationId = null;
let egyptianWarTimerDurationMs = 15000;
let egyptianWarTimerRemainingMs = null;
let egyptianWarTimerDeadline = null;
let egyptianWarTimerAnimation = null;
let egyptianWarInputUnsubscribers = [];

function getAudio() {
  return currentContext?.audio ?? globalScope.GameHubAudio ?? {
    playEffect() {},
    setScene() {}
  };
}

function createKickPlayerButton(member, className) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = "Kick";
  button.setAttribute("aria-label", `Kick ${member.name}`);
  button.addEventListener("click", async () => {
    const context = currentContext;
    if (!context) return;
    const response = await context.removeMember(member.id);
    if (currentContext === context && response.message) context.notify(response.message);
  });
  return button;
}

function createEgyptianWarSlapHand() {
  const handGlyph = document.createElement("span");
  handGlyph.className = "egyptian-war-flying-hand-glyph";
  handGlyph.setAttribute("aria-hidden", "true");

  const desktopHand = document.createElement("span");
  desktopHand.className = "egyptian-war-slap-hand-desktop";
  desktopHand.textContent = "\u{1F590}\uFE0F";

  const mobileHand = document.createElement("span");
  mobileHand.className = "egyptian-war-slap-hand-mobile";
  mobileHand.textContent = "\u{1F91A}";

  handGlyph.append(desktopHand, mobileHand);
  return handGlyph;
}
function renderEgyptianWarSlapRules(settings) {
  const rules = [
    settings.includeJokers && "Joker: always slappable",
    settings.allowDoubles && "Doubles: matching consecutive ranks",
    settings.allowSandwiches && "Sandwich: matching ranks with one between",
    settings.allowThreeInARow && "Three in a row: ascending/descending sequence",
    settings.allowTopBottom && "Top-bottom: newest matches the first card",
    settings.allowTens && "Tens: adjacent number cards total 10",
    settings.allowMarriage && "Marriage: King and Queen consecutively"
  ].filter(Boolean);

  egyptianWarSlapRulesList.replaceChildren();

  for (const rule of rules) {
    const item = document.createElement("li");
    item.textContent = rule;
    egyptianWarSlapRulesList.appendChild(item);
  }

  if (rules.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No slap patterns are enabled.";
    egyptianWarSlapRulesList.appendChild(item);
  }

  const penalty = settings.falseSlapPenaltyCards ?? 2;
  const penaltyItem = document.createElement("li");
  penaltyItem.textContent =
    `False slap: forfeit up to ${penalty} ` +
    `${penalty === 1 ? "card" : "cards"}.`;
  egyptianWarSlapRulesList.appendChild(penaltyItem);

  const eliminatedCooldownItem = document.createElement("li");
  eliminatedCooldownItem.textContent =
    "False slap while out: skip two cards, then slap again on the third.";
  egyptianWarSlapRulesList.appendChild(eliminatedCooldownItem);
}

function setEgyptianWarTimerHidden(isHidden) {
  if (isHidden) {
    egyptianWarTimerAnimation?.cancel();
    egyptianWarTimerAnimation = null;
  }
  egyptianWarTurnTimer.classList.toggle("is-hidden", isHidden);
  egyptianWarTurnTimer.setAttribute(
    "aria-hidden",
    String(isHidden)
  );
}

function clearEgyptianWarSoundTimeouts() {
  for (const timeout of egyptianWarSoundTimeouts) {
    clearTimeout(timeout);
  }

  egyptianWarSoundTimeouts = [];
}

function queueEgyptianWarSound(effectName, delayMs = 0) {
  if (delayMs <= 0) {
    getAudio().playEffect(effectName);
    return;
  }

  const timeout = setTimeout(() => {
    getAudio().playEffect(effectName);
    egyptianWarSoundTimeouts = egyptianWarSoundTimeouts.filter(
      (candidate) => candidate !== timeout
    );
  }, delayMs);
  egyptianWarSoundTimeouts.push(timeout);
}

function renderEgyptianWarTurnTimer() {
  renderOfflineStatus();
  if (egyptianWarTurnTimer.classList.contains("is-hidden")) {
    return;
  }

  const remainingMs = egyptianWarTimerDeadline === null
    ? egyptianWarTimerRemainingMs
    : Math.max(0, egyptianWarTimerDeadline - performance.now());

  if (remainingMs === null) {
    setEgyptianWarTimerHidden(true);
    return;
  }

  const percentRemaining = egyptianWarTimerDurationMs > 0
    ? Math.max(0, Math.min(100,
      remainingMs / egyptianWarTimerDurationMs * 100))
    : 0;
  const secondsRemaining = Math.ceil(remainingMs / 1000);

  if (!egyptianWarTimerAnimation) {
    egyptianWarTurnTimerBar.style.transform = `scaleX(${percentRemaining / 100})`;
  }
  const timerText = `${secondsRemaining}s`;
  if (egyptianWarTurnTimerValue.textContent !== timerText) {
    egyptianWarTurnTimerValue.textContent = timerText;
  }
  const progress = egyptianWarTurnTimerBar.parentElement;
  const progressValue = String(Math.round(percentRemaining));
  if (progress.getAttribute("aria-valuenow") !== progressValue) {
    progress.setAttribute("aria-valuenow", progressValue);
  }
}

function showEgyptianWarGame(game) {
  getAudio().setScene("egyptian-war");
  previousEgyptianWarState = null;
  visibleEgyptianWarCards = [];
  activeEgyptianWarAnimation = null;
  lastEgyptianWarAnimationId = 0;
  revealedEgyptianWarWinnerAnimationId = null;
  clearTimeout(egyptianWarAnimationTimeout);
  clearTimeout(egyptianWarTransferTimeout);
  clearTimeout(egyptianWarWinnerRevealTimeout);
  clearEgyptianWarSoundTimeouts();
  egyptianWarAnimationLayer.replaceChildren();
  egyptianWarVictory.hidden = true;
  setEgyptianWarTimerHidden(true);
  egyptianWarTimerRemainingMs = null;
  egyptianWarTimerDeadline = null;
  egyptianWarHostControls.classList.toggle("d-none", !currentContext.isHost);
  egyptianWarPauseButton.textContent =
    game.isPaused ? "Resume" : "Pause";
  egyptianWarPauseButton.setAttribute(
    "aria-pressed",
    String(game.isPaused === true)
  );
  currentSettings = game.settings ?? currentSettings;
  renderEgyptianWarSlapRules(currentSettings);
  egyptianWarUnreadChatCount = 0;
  renderEgyptianWarChatBadge();
  restoreLayoutPreferences();
  configureEgyptianWarSidePanel(game.chatEnabled === true);
  egyptianWarChatMessages.replaceChildren();
}

let tableLayoutObserver = null;

// End seats stay centered; remaining players use evenly spaced flat-side slots.
// List seats clockwise so their visible order continues to match turn order.
function egyptianWarRectangleSeats(count) {
  const rightCount = Math.ceil((count - 2) / 2);
  const leftCount = Math.floor((count - 2) / 2);
  const seats = [{ x: 50, y: 10 }];
  for (let slot = 1; slot <= rightCount; slot++) {
    seats.push({ x: 82, y: 10 + 78 * slot / (rightCount + 1) });
  }
  seats.push({ x: 50, y: 88 });
  for (let slot = leftCount; slot >= 1; slot--) {
    seats.push({ x: 18, y: 10 + 78 * slot / (leftCount + 1) });
  }
  return seats;
}

// Reveal new activity without interrupting a reader on unchanged timer snapshots.
function setEgyptianWarTableText(element, text) {
  const next = text ?? "";
  if (element.textContent === next) return;
  element.textContent = next;
  findEgyptianWarElement(".egyptian-war-table-updates").scrollTop = 0;
}

function fitEgyptianWarTableContent() {
  const arena = egyptianWarArena;
  const info = findEgyptianWarElement(".egyptian-war-table-info");
  if (!arena || !info) return;
  const bounds = arena.getBoundingClientRect();
  const seats = [...egyptianWarPlayers.children].map((seat) => {
    const box = seat.getBoundingClientRect();
    const actions = seat.querySelector(".egyptian-war-disconnected-actions")?.getBoundingClientRect();
    return actions ? {
      left: Math.min(box.left, actions.left), right: Math.max(box.right, actions.right),
      top: Math.min(box.top, actions.top), bottom: Math.max(box.bottom, actions.bottom)
    } : box;
  });
  if (!egyptianWarSlapRulesList.hidden) {
    const rules = egyptianWarSlapRulesList.parentElement.getBoundingClientRect();
    const list = egyptianWarSlapRulesList.getBoundingClientRect();
    let availableBottom = globalScope.innerHeight - 8;
    for (const seat of seats) {
      if (seat.right > rules.left && seat.left < rules.right && seat.bottom > rules.top) {
        availableBottom = Math.min(availableBottom, seat.top - 8);
      }
    }
    const bottomInset = rules.bottom - list.bottom;
    egyptianWarSlapRulesList.style.maxHeight = `${Math.max(0, availableBottom - list.top - bottomInset)}px`;
  }
  const centerX = bounds.left + bounds.width / 2;
  // A narrow center column clears the diagonal seats on shallow oval tables.
  const shallowOval = bounds.height <= 220 && bounds.width >= bounds.height;
  let halfWidth = shallowOval
    ? Math.min(bounds.width * 0.12, 120)
    : Math.min(bounds.width * 0.22, 200);
  for (const box of seats) {
    const offset = (box.left + box.right) / 2 - centerX;
    if (Math.abs(offset) < bounds.width * 0.24) continue;
    halfWidth = Math.min(halfWidth, offset < 0 ? centerX - box.right - 8 : box.left - centerX - 8);
  }
  halfWidth = Math.max(40, halfWidth);
  info.style.width = `${halfWidth * 2}px`;
  let top = 8, bottom = 8;
  for (const box of seats) {
    if (box.right <= centerX - halfWidth || box.left >= centerX + halfWidth) continue;
    if ((box.top + box.bottom) / 2 < bounds.top + bounds.height / 2) {
      top = Math.max(top, box.bottom - bounds.top + 8);
    } else {
      bottom = Math.max(bottom, bounds.bottom - box.top + 8);
    }
  }
  info.style.top = `${top}px`;
  info.style.bottom = `${bottom}px`;
}

function destroyEgyptianWarGame() {
  tableLayoutObserver?.disconnect();
  tableLayoutObserver = null;
  egyptianWarArena.removeEventListener("transitionend", fitEgyptianWarTableContent);
  clearTimeout(egyptianWarAnimationTimeout);
  clearTimeout(egyptianWarTransferTimeout);
  clearTimeout(egyptianWarWinnerRevealTimeout);
  clearEgyptianWarSoundTimeouts();
  activeEgyptianWarAnimation = null;
  revealedEgyptianWarWinnerAnimationId = null;
  egyptianWarAnimationLayer.replaceChildren();
  egyptianWarVictory.hidden = true;
  setEgyptianWarTimerHidden(true);
  egyptianWarTimerRemainingMs = null;
  egyptianWarTimerDeadline = null;
  egyptianWarChat.hidden = true;
  egyptianWarChatInput.value = "";
  egyptianWarHostControls.classList.add("d-none");
}

function showEgyptianWarSidePanel(panel) {
  if (panel === "chat" && showGameChatButton.disabled) panel = "spectators";
  for (const [name, button, content] of [
    ["chat", showGameChatButton, egyptianWarChat],
    ["spectators", showGameSpectatorsButton, egyptianWarSpectators],
    ["scoreboard", findEgyptianWarElement("#show-game-scoreboard"), findEgyptianWarElement("#egyptian-war-scoreboard")]
  ]) {
    const active = panel === name;
    content.hidden = !active;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    button.classList.toggle("btn-light", active);
    button.classList.toggle("btn-outline-light", !active);
  }
}

function configureEgyptianWarSidePanel(chatEnabled) {
  showGameChatButton.disabled = !chatEnabled;
  showEgyptianWarSidePanel(chatEnabled ? "chat" : "spectators");
}

// mode is "closed" (just the circle button), "medium" or "large".
function setEgyptianWarSidePanelMode(mode) {
  const isClosed = mode === "closed";
  const isExpanded = mode === "large";

  egyptianWarSidePanelMode = mode;
  if (!isClosed) {
    egyptianWarSidePanelReopenMode = mode;
    egyptianWarUnreadChatCount = 0;
    renderEgyptianWarChatBadge();
  }

  egyptianWarSidePanel.hidden = isClosed;
  openGameSidePanelButton.hidden = !isClosed;
  openGameSidePanelButton.setAttribute("aria-expanded", String(!isClosed));
  egyptianWarSidePanel.classList.toggle("is-expanded", isExpanded);
  toggleGameSidePanelButton.setAttribute(
    "aria-expanded",
    String(isExpanded)
  );
  const actionLabel = isExpanded ? "Collapse panel" : "Expand panel";
  toggleGameSidePanelButton.setAttribute("aria-label", actionLabel);
  toggleGameSidePanelButton.title = actionLabel;
  toggleGameSidePanelButton.classList.toggle("is-collapse", isExpanded);
  const chevrons = Array.from({ length: 2 }, () => {
    const line = document.createElement("span");
    line.setAttribute("aria-hidden", "true");
    return line;
  });
  toggleGameSidePanelButton.replaceChildren(...chevrons);
  saveLayoutPreferences();
}

function setEgyptianWarSidePanelExpanded(isExpanded) {
  setEgyptianWarSidePanelMode(isExpanded ? "large" : "medium");
}

function renderEgyptianWarChatBadge() {
  const count = egyptianWarUnreadChatCount;
  egyptianWarChatBadge.hidden = count === 0;
  egyptianWarChatBadge.textContent = count > 9 ? "9+" : String(count);
  const label = count === 0
    ? "Open game panel"
    : `Open game panel, ${count} new ${count === 1 ? "message" : "messages"}`;
  openGameSidePanelButton.setAttribute("aria-label", label);
  openGameSidePanelButton.title = label;
}

function minimizeEgyptianWarSidePanel() {
  setEgyptianWarSidePanelMode("closed");
  openGameSidePanelButton.focus();
}

function reopenEgyptianWarSidePanel() {
  setEgyptianWarSidePanelMode(egyptianWarSidePanelReopenMode);
  const selectedTab = findEgyptianWarElement('.egyptian-war-side-tabs [aria-selected="true"]');
  selectedTab.focus();
}

function updateEgyptianWarTurnTimer(state) {
  egyptianWarTimerAnimation?.cancel();
  egyptianWarTimerAnimation = null;
  egyptianWarTimerDurationMs = state.turnTimerSeconds * 1000;
  egyptianWarTimerRemainingMs = state.turnTimeRemainingMs;
  egyptianWarTimerDeadline =
    state.status === "playing" &&
      !state.isPaused &&
      !state.isAnimating &&
      state.turnTimeRemainingMs !== null
      ? performance.now() + state.turnTimeRemainingMs
      : null;
  setEgyptianWarTimerHidden(
    state.status !== "playing" ||
    state.isAnimating ||
    state.turnTimeRemainingMs === null
  );
  renderEgyptianWarTurnTimer();
  if (egyptianWarTimerDeadline !== null && state.turnTimeRemainingMs > 0) {
    egyptianWarTimerAnimation = egyptianWarTurnTimerBar.animate?.([
      { transform: egyptianWarTurnTimerBar.style.transform },
      { transform: "scaleX(0)" }
    ], {
      duration: Math.max(0, egyptianWarTimerDeadline - performance.now()),
      easing: "linear",
      fill: "forwards"
    }) ?? null;
  }
}




function createEgyptianWarCard(card, offset = 0) {
  const rankLabels = {
    jack: "J",
    queen: "Q",
    king: "K",
    ace: "A",
    joker: "J"
  };
  const suitSymbols = {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠"
  };
  const rankLabel = rankLabels[card.rank] ?? card.rank;
  // Request a text glyph so the Modern font cannot turn suits into emoji.
  const suitSymbol = (card.suit === null ? "★" : suitSymbols[card.suit]) + "\uFE0E";
  const description = card.suit === null
    ? "Joker"
    : `${rankLabel} of ${card.suit}`;
  const cardElement = document.createElement("div");

  cardElement.className = "playing-card";
  cardElement.dataset.cardId = card.id;
  cardElement.setAttribute("role", "img");
  cardElement.setAttribute("aria-label", description);
  cardElement.style.setProperty("--stack-x", `${offset * 12}px`);
  cardElement.style.setProperty("--stack-y", `${Math.abs(offset) * 2}px`);
  cardElement.style.setProperty(
    "--stack-rotation",
    `${offset * 5}deg`
  );

  if (card.suit === "diamonds" || card.suit === "hearts") {
    cardElement.classList.add("is-red");
  }

  if (card.suit === null) {
    cardElement.classList.add("is-joker");
  }

  if (["jack", "queen", "king"].includes(card.rank)) {
    cardElement.classList.add("is-face-card");
  }

  const corner = document.createElement("span");
  corner.className = "playing-card-corner";
  corner.textContent = card.suit === null
    ? "JOKER"
    : `${rankLabel}\n${suitSymbol}`;

  const oppositeCorner = corner.cloneNode(true);
  oppositeCorner.classList.add("is-opposite");

  const center = document.createElement("span");
  center.className = "playing-card-center";

  if (card.suit === null) {
    const jokerMonogram = document.createElement("span");
    jokerMonogram.className = "playing-card-joker-monogram";
    jokerMonogram.textContent = "J";

    const jokerOrnament = document.createElement("span");
    jokerOrnament.className = "playing-card-joker-ornament";
    jokerOrnament.textContent = "★ ◆ ★";
    center.append(jokerMonogram, jokerOrnament);
  } else {
    center.textContent = suitSymbol;
  }

  cardElement.append(corner, center, oppositeCorner);
  return cardElement;
}

function getEgyptianWarCenter(element, within) {
  const rect = element.getBoundingClientRect();
  const parentRect = within.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2 - parentRect.left,
    y: rect.top + rect.height / 2 - parentRect.top
  };
}

function animateEgyptianWarOutcome(animation) {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  clearEgyptianWarSoundTimeouts();
  egyptianWarAnimationLayer.replaceChildren();
  const arena = findEgyptianWarElement("#egyptian-war-arena");
  const center = getEgyptianWarCenter(
    egyptianWarPileStack,
    arena
  );
  const actorSeat = egyptianWarPlayers.querySelector(
    `[data-player-id="${CSS.escape(animation.actorId)}"]`
  );
  const winnerSeat = animation.winnerId
    ? egyptianWarPlayers.querySelector(
      `[data-player-id="${CSS.escape(animation.winnerId)}"]`
    )
    : null;
  const actorCenter = actorSeat
    ? getEgyptianWarCenter(actorSeat, arena)
    : center;
  const winnerCenter = winnerSeat
    ? getEgyptianWarCenter(winnerSeat, arena)
    : center;

  if (
    animation.playedCard &&
    actorSeat &&
    animation.action !== "slap" &&
    !prefersReducedMotion
  ) {
    const directionX = center.x - actorCenter.x;
    const directionY = center.y - actorCenter.y;
    const distance = Math.hypot(directionX, directionY) || 1;
    const normalizedX = directionX / distance;
    const normalizedY = directionY / distance;
    const dealtCard = egyptianWarPileStack.querySelector(
      ".playing-card.is-dealing"
    );
    const dealtCardRect = dealtCard?.getBoundingClientRect();
    const dealtCardWidth = dealtCardRect?.width || 84;
    const dealtCardHeight = dealtCardRect?.height || 120;
    const horizontalEdgeDistance = Math.abs(normalizedX) > 0.001
      ? dealtCardWidth / 2 / Math.abs(normalizedX)
      : Number.POSITIVE_INFINITY;
    const verticalEdgeDistance = Math.abs(normalizedY) > 0.001
      ? dealtCardHeight / 2 / Math.abs(normalizedY)
      : Number.POSITIVE_INFINITY;
    const cardEdgeDistance = Math.min(
      horizontalEdgeDistance,
      verticalEdgeDistance
    );
    const handLandingOffset =
      cardEdgeDistance + dealtCardWidth * 0.22;
    const effectiveHandLandingOffset = Math.min(
      handLandingOffset,
      distance * 0.82
    );
    const handTargetX =
      center.x - normalizedX * effectiveHandLandingOffset;
    const handTargetY =
      center.y - normalizedY * effectiveHandLandingOffset;
    const handTravelX = handTargetX - actorCenter.x;
    const handTravelY = handTargetY - actorCenter.y;
    const rotation =
      Math.atan2(directionY, directionX) * (180 / Math.PI) + 90;
    const hand = document.createElement("span");
    const handGlyph = document.createElement("span");

    hand.className = "egyptian-war-card-play-hand";
    handGlyph.className = "egyptian-war-card-play-hand-glyph";
    handGlyph.textContent = "🖐️";
    hand.appendChild(handGlyph);
    hand.style.left = `${actorCenter.x}px`;
    hand.style.top = `${actorCenter.y}px`;
    hand.style.setProperty(
      "--play-hand-x",
      `${handTravelX}px`
    );
    hand.style.setProperty(
      "--play-hand-y",
      `${handTravelY}px`
    );
    hand.style.setProperty(
      "--play-hand-retreat-x",
      `${handTravelX * 0.82}px`
    );
    hand.style.setProperty(
      "--play-hand-retreat-y",
      `${handTravelY * 0.82}px`
    );
    hand.style.setProperty(
      "--play-hand-rotation",
      `${rotation}deg`
    );
    egyptianWarAnimationLayer.appendChild(hand);
  }

  if (animation.playedCard && animation.action !== "slap") {
    queueEgyptianWarSound(
      "card-play",
      prefersReducedMotion ? 0 : 420
    );
  }

  const slapAttempts =
    Array.isArray(animation.slapAttempts) &&
      animation.slapAttempts.length > 0
      ? animation.slapAttempts
      : [
        {
          playerId: animation.actorId,
          delayMs: 0,
          isWinner: true
        }
      ];

  if (animation.action === "slap") {
    slapAttempts.forEach((attempt, index) => {
      const playerId = attempt.playerId;
      const playerSeat = egyptianWarPlayers.querySelector(
        `[data-player-id="${CSS.escape(playerId)}"]`
      );

      if (!playerSeat) {
        return;
      }

      const playerCenter = getEgyptianWarCenter(
        playerSeat,
        arena
      );

      const directionX = center.x - playerCenter.x;
      const directionY = center.y - playerCenter.y;

      const distance =
        Math.hypot(directionX, directionY) || 1;

      const normalizedX = directionX / distance;
      const normalizedY = directionY / distance;

      // Leave each hand slightly toward its player's table position.
      const visiblePileCard = egyptianWarPileStack.querySelector(
        ".playing-card"
      );
      const renderedCardWidth =
        visiblePileCard?.getBoundingClientRect().width ?? 0;
      const pileOffset = Math.max(14, renderedCardWidth * 0.25);
      const destinationX =
        center.x - normalizedX * pileOffset;
      const destinationY =
        center.y - normalizedY * pileOffset;

      const rotation =
        Math.atan2(directionY, directionX) *
        (180 / Math.PI) +
        90;

      const hand = document.createElement("span");
      hand.className = "egyptian-war-flying-hand";
      const handGlyph = createEgyptianWarSlapHand();
      hand.appendChild(handGlyph);

      hand.style.left = `${playerCenter.x}px`;
      hand.style.top = `${playerCenter.y}px`;
      hand.style.zIndex = String(5 + index);
      const delayMs =
        !prefersReducedMotion && Number.isFinite(attempt.delayMs)
          ? Math.max(0, attempt.delayMs)
          : 0;

      hand.style.animationDelay = `${delayMs}ms`;

      queueEgyptianWarSound(
        "slap",
        prefersReducedMotion ? 0 : delayMs + 520
      );

      hand.style.setProperty(
        "--hand-x",
        `${destinationX - playerCenter.x}px`
      );

      hand.style.setProperty(
        "--hand-y",
        `${destinationY - playerCenter.y}px`
      );

      hand.style.setProperty(
        "--hand-rotation",
        `${rotation}deg`
      );

      egyptianWarAnimationLayer.appendChild(hand);
    });
  }

  const transferCount = animation.isFinalWin
    ? 24
    : Math.min(
      animation.transferCardCount > 0
        ? animation.transferCardCount
        : animation.penaltyCardCount,
      8
    );
  const isPileTransfer = animation.transferCardCount > 0;
  const source = isPileTransfer
    ? center
    : actorCenter;
  const destination = isPileTransfer
    ? winnerCenter
    : center;

  const showTransfer = () => {
    for (let index = 0; index < transferCount; index += 1) {
      const back = document.createElement("span");
      back.className =
        animation.isFinalWin
          ? "egyptian-war-flying-card is-final-card"
          : isPileTransfer
            ? "egyptian-war-flying-card is-transferring"
            : "egyptian-war-flying-card is-penalty-card";
      back.textContent = animation.isFinalWin ? "★" : "";
      back.style.left = `${source.x + (index % 5) * 3}px`;
      back.style.top = `${source.y + (index % 7) * 2}px`;
      back.style.setProperty(
        "--card-x",
        `${destination.x - source.x}px`
      );
      back.style.setProperty(
        "--card-y",
        `${destination.y - source.y}px`
      );
      back.style.animationDelay = prefersReducedMotion
        ? "0ms"
        : `${animation.isFinalWin ? index * 45 : index * 35}ms`;
      egyptianWarAnimationLayer.appendChild(back);
    }
  };

  const latestSlapDelay = slapAttempts.reduce(
    (latestDelay, attempt) =>
      Math.max(
        latestDelay,
        Number.isFinite(attempt.delayMs)
          ? Math.max(0, attempt.delayMs)
          : 0
      ),
    0
  );

  const lastHandLandingDelay =
    prefersReducedMotion ? 1 : latestSlapDelay + 520;

  const transferDelay = animation.transferCardCount > 0
    ? prefersReducedMotion
      ? 0
      : animation.action === "slap"
        ? lastHandLandingDelay + 250
        : animation.playedCard
          ? 700
          : 350
    : 0;

  clearTimeout(egyptianWarTransferTimeout);

  if (transferCount > 0 && transferDelay > 0) {
    egyptianWarTransferTimeout = setTimeout(
      showTransfer,
      transferDelay
    );
  } else if (transferCount > 0) {
    showTransfer();
  }

  clearTimeout(egyptianWarWinnerRevealTimeout);

  const revealPileWinner = () => {
    revealedEgyptianWarWinnerAnimationId = animation.id;
    const currentWinnerSeat = animation.winnerId
      ? egyptianWarPlayers.querySelector(
        `[data-player-id="${CSS.escape(animation.winnerId)}"]`
      )
      : null;
    currentWinnerSeat?.classList.add("is-pile-winner");

    if (
      animation.action === "slap" &&
      !animation.isFinalWin &&
      typeof animation.activityMessage === "string"
    ) {
      setEgyptianWarTableText(egyptianWarMessage, animation.activityMessage);
    }

    if (animation.action === "slap") {
      getAudio().playEffect(
        animation.isFinalWin ? "game-win" : "pile-win"
      );
    }
  };

  if (winnerSeat && animation.action === "slap") {
    egyptianWarWinnerRevealTimeout = setTimeout(
      revealPileWinner,
      lastHandLandingDelay
    );
  } else if (winnerSeat) {
    revealPileWinner();
    queueEgyptianWarSound(
      animation.isFinalWin ? "game-win" : "pile-win",
      animation.playedCard && !prefersReducedMotion ? 620 : 0
    );
  }

  if (animation.isFinalWin) {
    const winner = animation.winnerId
      ? animation.players?.find(
        (player) => player.id === animation.winnerId
      )
      : null;
    egyptianWarVictory.hidden = false;
    const collected = document.createElement("span");
    collected.className = "egyptian-war-victory-heading";
    collected.textContent = "ALL CARDS COLLECTED";

    const winnerAvatar = document.createElement("span");
    winnerAvatar.className = "egyptian-war-victory-avatar";
    winnerAvatar.textContent = winner?.avatar ?? "🏆";
    winnerAvatar.setAttribute("aria-hidden", "true");

    const winnerDetails = document.createElement("span");
    winnerDetails.className = "egyptian-war-victory-details";

    const winnerMessage = document.createElement("span");
    winnerMessage.className = "egyptian-war-victory-winner";
    winnerMessage.textContent = winner
      ? `${winner.name} wins!`
      : "Game won!";

    const championLabel = document.createElement("span");
    championLabel.className = "egyptian-war-victory-champion";
    championLabel.textContent = winner
      ? `🏆 Champion • ${winner.cardCount} cards`
      : "🏆 Egyptian War champion";

    winnerDetails.append(collected, winnerMessage, championLabel);
    egyptianWarVictory.replaceChildren(winnerAvatar, winnerDetails);
  }

  const duration = Number.isFinite(animation.durationMs)
    ? animation.durationMs
    : animation.isFinalWin
      ? 3600
      : animation.transferCardCount > 0
        ? 2400
        : animation.action === "slap"
          ? 1050
          : animation.playedCard
            ? 650
            : 450;
  const presentationDuration = prefersReducedMotion
    ? 100
    : duration;

  clearTimeout(egyptianWarAnimationTimeout);
  egyptianWarAnimationTimeout = setTimeout(() => {
    egyptianWarAnimationLayer.replaceChildren();
    clearTimeout(egyptianWarTransferTimeout);
    clearTimeout(egyptianWarWinnerRevealTimeout);
    clearEgyptianWarSoundTimeouts();
    egyptianWarPlayers
      .querySelectorAll(".is-pile-winner")
      .forEach((seat) => seat.classList.remove("is-pile-winner"));
    activeEgyptianWarAnimation = null;
    if (!animation.isFinalWin) {
      egyptianWarVictory.hidden = true;
    }
  }, presentationDuration);
}

function renderEgyptianWarState(state) {
  offlinePlayers = state.offlinePlayers ?? [];
  offlinePaused = state.isPaused;
  if (Number.isFinite(state.serverNow)) offlineClockOffset = state.serverNow - Date.now();
  renderOfflineStatus();
  const previousState = previousEgyptianWarState;
  const animation = activeEgyptianWarAnimation;
  const currentPlayer = state.players.find(
    (player) => player.id === state.currentPlayerId
  );
  const winner = state.players.find(
    (player) => player.id === state.winnerId
  );
  const isNewAnimation =
    animation !== null &&
    animation.id !== lastEgyptianWarAnimationId;
  const isShowingCollectedPile =
    state.isAnimating &&
    animation?.transferCardCount > 0;
  const isWaitingForSlapWinnerReveal =
    animation?.action === "slap" &&
    animation.winnerId !== null &&
    revealedEgyptianWarWinnerAnimationId !== animation.id;

  if (previousState === null) {
    visibleEgyptianWarCards = state.recentCards.map((card) => ({
      card,
      playerId: null
    }));
  }

  updateEgyptianWarTurnTimer(state);

  const turnText = state.isPaused
    ? state.pauseMessage ?? "Game is paused"
    : winner
      ? `${winner.name} wins!`
      : currentPlayer
        ? currentPlayer.id === currentContext.memberId
          ? "It's your turn"
          : `${currentPlayer.name}'s turn`
        : "Game complete";
  if (egyptianWarTurn.textContent !== turnText) egyptianWarTurn.textContent = turnText;

  if (state.challenge) {
    const challenger = state.players.find(
      (player) => player.id === state.challenge.challengerId
    );
    const responder = state.players.find(
      (player) => player.id === state.challenge.responderId
    );

    setEgyptianWarTableText(egyptianWarChallenge,
      `${challenger?.name ?? "A player"} challenged ` +
      `${responder?.name ?? "the next player"}: ` +
      `${state.challenge.attemptsRemaining} ` +
      `${state.challenge.attemptsRemaining === 1 ? "attempt" : "attempts"} remaining.`);
  } else {
    setEgyptianWarTableText(egyptianWarChallenge, "");
  }

  const displayedPileCardCount = isShowingCollectedPile
    ? animation.pileCardCountBeforeTransfer
    : state.pileCardCount;

  egyptianWarPileCount.textContent =
    `${displayedPileCardCount} ${displayedPileCardCount === 1 ? "card" : "cards"}`;

  const pileWasCollected =
    previousState !== null &&
    state.pileCardCount < previousState.pileCardCount;

  if (
    !isShowingCollectedPile &&
    (
      state.pileCardCount === 0 ||
      pileWasCollected ||
      !state.hasFaceUpCards
    )
  ) {
    visibleEgyptianWarCards = [];
  }

  const playedCard =
    animation?.playedCard ??
    state.topCard;

  const hasNewCard =
    playedCard !== null &&
    playedCard !== undefined &&
    animation?.playedCard !== null &&
    animation?.playedCard !== undefined &&
    (isNewAnimation || (
      state.pileCardCount > 0 &&
      (previousState === null ||
        (
          state.pileCardCount > previousState.pileCardCount &&
          state.topCard?.id !== previousState.topCard?.id
        ))
    ));

  if (hasNewCard) {
    visibleEgyptianWarCards.push({
      card: playedCard,
      playerId: animation?.actorId ??
        previousState?.currentPlayerId ??
        null
    });

    if (visibleEgyptianWarCards.length > 5) {
      visibleEgyptianWarCards.shift();
    }
  }

  const existingSeats = new Map([...egyptianWarPlayers.children].map((seat) => [seat.dataset.playerId, seat]));
  const playerIds = new Set(state.players.map((player) => player.id));
  for (const [id, seat] of existingSeats) {
    if (!playerIds.has(id)) {
      tableLayoutObserver?.unobserve(seat);
      const actions = seat.querySelector(".egyptian-war-disconnected-actions");
      if (actions) tableLayoutObserver?.unobserve(actions);
      seat.remove();
    }
  }

  const playerCount = state.players.length;
  egyptianWarArena.dataset.playerCount = String(playerCount);
  const rectangleSeats = egyptianWarRectangleSeats(playerCount);

  state.players.forEach((player, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / playerCount;
    const seat = existingSeats.get(player.id) ?? document.createElement("div");
    const isNewSeat = !existingSeats.has(player.id);
    if (isNewSeat) seat.className = "egyptian-war-seat";
    seat.dataset.playerId = player.id;
    seat.classList.toggle("is-current", player.isCurrentPlayer);
    seat.classList.toggle("is-eliminated", player.isEliminated);
    seat.classList.toggle("is-disconnected", !player.isConnected);
    seat.classList.toggle(
      "is-pile-winner",
      animation?.winnerId === player.id &&
      !isWaitingForSlapWinnerReveal
    );
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    seat.dataset.tableHalf = directionY > 0 ? "bottom" : "top";
    // Keep equal-angle oval seating and separate flat-edge rectangle slots.
    // Both positions remain available to CSS during live shape changes.
    const rectangleSeat = rectangleSeats[index];
    seat.style.setProperty("--oval-seat-x", `${50 + directionX * 40}%`);
    seat.style.setProperty("--oval-seat-y", `${50 + directionY * 37}%`);
    seat.style.setProperty("--rectangle-seat-x", `${rectangleSeat.x}%`);
    seat.style.setProperty("--rectangle-seat-y", `${rectangleSeat.y}%`);

    if (isNewSeat) {
      seat.innerHTML = '<span class="player-avatar"></span><div class="egyptian-war-seat-details"><span class="player-name"></span><span class="egyptian-war-card-count"></span></div>';
    }
    tableLayoutObserver?.observe(seat);
    const setText = (selector, value) => {
      const element = seat.querySelector(selector);
      if (element.textContent !== value) element.textContent = value;
    };
    setText(".player-avatar", player.avatar);
    setText(".player-name", player.name);
    seat.querySelector(".player-name").title = player.name;
    setText(".egyptian-war-card-count", `${player.cardCount} ${player.cardCount === 1 ? "card" : "cards"}`);
    let eliminated = seat.querySelector(".egyptian-war-seat-details .badge");
    if (player.isEliminated && !eliminated) {
      eliminated = document.createElement("span");
      eliminated.className = "badge text-bg-secondary egyptian-war-out-badge";
      eliminated.textContent = "Out";
      seat.querySelector(".egyptian-war-seat-details").appendChild(eliminated);
    } else if (!player.isEliminated) eliminated?.remove();
    let actions = seat.querySelector(".egyptian-war-disconnected-actions");
    if (player.isConnected && actions) {
      tableLayoutObserver?.unobserve(actions);
      actions.remove();
      actions = null;
    }
    else if (!player.isConnected && !actions) {
      actions = document.createElement("div");
      actions.className = "egyptian-war-disconnected-actions";
      actions.innerHTML = '<span class="badge text-bg-warning">Disconnected</span>';
      if (currentContext.isHost) actions.appendChild(createKickPlayerButton(player, "btn btn-outline-danger btn-sm"));
      seat.appendChild(actions);
    }
    if (actions) tableLayoutObserver?.observe(actions);
    actions?.querySelector("button")?.setAttribute("aria-label", `Kick ${player.name}`);
    if (egyptianWarPlayers.children[index] !== seat) {
      egyptianWarPlayers.insertBefore(seat, egyptianWarPlayers.children[index] ?? null);
    }
  });
  if (!tableLayoutObserver) fitEgyptianWarTableContent();

  egyptianWarPileStack
    .querySelectorAll(".playing-card")
    .forEach((card) => card.remove());

  visibleEgyptianWarCards.forEach((visibleCard, index) => {
    const cardElement = createEgyptianWarCard(
      visibleCard.card,
      index - (visibleEgyptianWarCards.length - 1) / 2
    );
    cardElement.style.zIndex = String(index + 1);

    const isLatestCard =
      index === visibleEgyptianWarCards.length - 1 && hasNewCard;

    if (isLatestCard) {
      cardElement.classList.add("is-dealing");
    }

    egyptianWarPileStack.appendChild(cardElement);

    if (isLatestCard && visibleCard.playerId !== null) {
      const sourceSeat = egyptianWarPlayers.querySelector(
        `[data-player-id="${CSS.escape(visibleCard.playerId)}"]`
      );

      if (sourceSeat) {
        const sourceCenter = getEgyptianWarCenter(
          sourceSeat,
          egyptianWarArena
        );
        const targetCenter = getEgyptianWarCenter(
          egyptianWarPileStack,
          egyptianWarArena
        );
        cardElement.style.setProperty(
          "--fly-x",
          `${sourceCenter.x - targetCenter.x}px`
        );
        cardElement.style.setProperty(
          "--fly-y",
          `${sourceCenter.y - targetCenter.y}px`
        );
      }
    }
  });

  egyptianWarTopCard.hidden = visibleEgyptianWarCards.length > 0;
  setEgyptianWarTableText(egyptianWarMessage, state.status === "finished"
    ? ""
    : isWaitingForSlapWinnerReveal
      ? previousState?.activityMessage ?? ""
      : state.activityMessage);
  egyptianWarPlayCardButton.disabled =
    (currentContext.role === "spectator") ||
    state.status !== "playing" ||
    state.isPaused ||
    state.isAnimating ||
    state.canPlayCard !== true ||
    state.currentPlayerId !== currentContext.memberId;
  egyptianWarSlapButton.disabled =
    (currentContext.role === "spectator") ||
    state.status !== "playing" ||
    state.isPaused ||
    (state.isAnimating && animation?.allowsSlaps !== true) ||
    !state.hasFaceUpCards;
  egyptianWarHostControls.classList.toggle(
    "d-none",
    !currentContext.isHost || state.status !== "playing"
  );
  egyptianWarPauseButton.textContent =
    state.isPaused ? "Resume" : "Pause";
  egyptianWarPauseButton.setAttribute(
    "aria-pressed",
    String(state.isPaused)
  );

  if (isNewAnimation) {
    lastEgyptianWarAnimationId = animation.id;
    animateEgyptianWarOutcome({
      ...animation,
      activityMessage: state.activityMessage,
      players: state.players
    });
  }

  previousEgyptianWarState = state;
}


let lastSpectators = [];
function renderSpectators(spectators) {
  lastSpectators = spectators;
  egyptianWarSpectatorList.replaceChildren();
  for (const spectator of spectators) {
    const item = document.createElement("li");
    item.className = "list-group-item d-flex align-items-center gap-3";
    const avatar = document.createElement("span");
    avatar.className = "player-avatar";
    avatar.textContent = spectator.avatar;
    avatar.setAttribute("aria-label", `${spectator.name}'s avatar: ${spectator.avatar}`);
    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = spectator.name;
    item.append(avatar, name);
    if (!spectator.isConnected) {
      const label = document.createElement("span");
      label.className = "badge text-bg-warning";
      label.textContent = "Disconnected";
      item.appendChild(label);
    }
    if (currentContext.isHost) {
      item.appendChild(createKickPlayerButton(spectator, "btn btn-outline-danger btn-sm ms-auto"));
    }
    egyptianWarSpectatorList.appendChild(item);
  }
}

function renderChatMessage(chatMessage) {
  const item = document.createElement("li");
  item.className = "egyptian-war-chat-message";
  const name = document.createElement("strong");
  name.textContent = `${chatMessage.senderName}: `;
  const message = document.createElement("span");
  message.textContent = chatMessage.message;
  item.append(name, message);
  egyptianWarChatMessages.appendChild(item);
  egyptianWarChatMessages.scrollTop = egyptianWarChatMessages.scrollHeight;

  if (
    egyptianWarSidePanelMode === "closed" &&
    !chatMessage.isHistory &&
    chatMessage.senderId !== currentContext?.memberId
  ) {
    egyptianWarUnreadChatCount += 1;
    renderEgyptianWarChatBadge();
  }
}

toggleSlapRulesButton.addEventListener("click", () => {
  const expanded = toggleSlapRulesButton.getAttribute("aria-expanded") !== "true";
  setSlapRulesExpanded(expanded);
  saveLayoutPreferences();
});
async function playEgyptianWarCard() {
  const context = currentContext;
  if (!context || egyptianWarPlayCardButton.disabled) return;
  const response = await context.submitAction({ type: "play-card" });
  if (currentContext === context && response && !response.success) context.notify(response.message);
}

async function slapEgyptianWarPile() {
  const context = currentContext;
  if (!context || egyptianWarSlapButton.disabled) return;
  const response = await context.submitAction({
    type: "slap",
    payload: { pileVersion: previousEgyptianWarState?.pileVersion }
  });
  if (currentContext === context && response && !response.success) context.notify(response.message);
}

egyptianWarPlayCardButton.addEventListener("click", playEgyptianWarCard);
egyptianWarSlapButton.addEventListener("click", slapEgyptianWarPile);
egyptianWarPauseButton.addEventListener("click", async () => {
  const context = currentContext;
  if (!context?.isHost) return;
  const isPaused = egyptianWarPauseButton.getAttribute("aria-pressed") !== "true";
  const response = await context.requestPause(isPaused);
  if (currentContext === context && !response.success) context.notify(response.message);
});
egyptianWarChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const context = currentContext;
  if (!context) return;
  const message = egyptianWarChatInput.value.trim();
  const response = await context.sendChat(message);
  if (currentContext !== context) return;
  if (!response.success) context.notify(response.message);
  else if (egyptianWarChatInput.value.trim() === message) egyptianWarChatInput.value = "";
});
showGameChatButton.addEventListener("click", () => showEgyptianWarSidePanel("chat"));
showGameSpectatorsButton.addEventListener("click", () => showEgyptianWarSidePanel("spectators"));
toggleGameSidePanelButton.addEventListener("click", () => {
  setEgyptianWarSidePanelMode(egyptianWarSidePanelMode === "large" ? "medium" : "large");
});
minimizeGameSidePanelButton.addEventListener("click", minimizeEgyptianWarSidePanel);
openGameSidePanelButton.addEventListener("click", reopenEgyptianWarSidePanel);

function updateEgyptianWarKeyHints() {
  const keyboard = currentContext?.input?.hasKeyboard?.() ?? false;
  for (const [action, id] of [["play-card", "egyptian-war-play-key"], ["slap", "egyptian-war-slap-key"]]) {
    const hint = findEgyptianWarElement("#" + id);
    const binding = currentContext?.input?.getBinding?.(action);
    hint.hidden = !keyboard || !binding;
    hint.textContent = binding ?? "";
  }
  findEgyptianWarElement("#egyptian-war-slap-subtitle").hidden = keyboard;
}

function applyEgyptianWarDisplay() {
  const root = currentContext?.root;
  if (!root) return;
  root.dataset.cardStyle = currentContext.display?.get("cardStyle") ?? "classic";
  root.dataset.tableColor = currentContext.display?.get("tableColor") ?? "green";
  root.dataset.shadows = currentContext.display?.get("shadows") ?? "full";
  root.dataset.cardAnimations = currentContext.display?.get("cardAnimations") ?? "full";
  root.dataset.tableDetail = currentContext.display?.get("tableDetail") ?? "textured";
}

let offlinePlayers = [];
let offlinePaused = false;
let offlineClockOffset = 0;
let hostRecoveryDeadline = null;
function renderOfflineStatus() {
  const now = Date.now() + offlineClockOffset;
  const seconds = (at) => Math.max(0, Math.ceil((at - now) / 1000));
  const messages = offlinePlayers.map((member) => `${member.name}: ${member.autoPlaying ? "auto-playing" : member.autoPlayAt ? `auto-play in ${seconds(member.autoPlayAt)}s` : "waiting to reconnect"}`);
  if (hostRecoveryDeadline) messages.push(`Host handoff in ${seconds(hostRecoveryDeadline)}s`);
  const text = messages.length ? `${offlinePaused ? "Paused" : "Running"} - ${messages.join("; ")}` : "";
  const label = findEgyptianWarElement("#egyptian-war-offline-status");
  if (label.textContent !== text) { label.textContent = text; label.title = text; }
}
function renderScoreboard(scores) {
  const container = findEgyptianWarElement("#egyptian-war-score-table");
  container.replaceChildren();
  const table = document.createElement("table"); table.className = "table table-dark table-sm";
  const header = table.createTHead().insertRow();
  for (const label of ["Player", ...scores.columns.map((column) => column.key === "slaps" ? "Slaps" : column.label)]) {
    const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label; header.appendChild(cell);
  }
  const body = table.createTBody();
  for (const row of scores.rows) {
    const tr = body.insertRow(); tr.insertCell().textContent = `${row.avatar} ${row.name}`;
    for (const column of scores.columns) tr.insertCell().textContent = String(row.values[column.key] ?? 0);
  }
  container.appendChild(table);
  if (!scores.rows.length) container.appendChild(document.createTextNode("No scores yet."));
}
findEgyptianWarElement(".egyptian-war-side-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = [...findEgyptianWarElement(".egyptian-war-side-tabs").querySelectorAll("button:not(:disabled)")];
  const index = buttons.indexOf(event.target);
  if (index < 0) return;
  event.preventDefault(); event.stopPropagation();
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
    : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].click(); buttons[next].focus();
});
findEgyptianWarElement("#show-game-scoreboard").addEventListener("click", () => showEgyptianWarSidePanel("scoreboard"));
findEgyptianWarElement("#egyptian-war-reset-scores").addEventListener("click", async () => {
  const context = currentContext;
  if (!context?.isHost) return;
  const result = await context.resetScoreboard?.();
  if (currentContext === context && result && !result.success) context.notify(result.message);
});

const egyptianWarClientModule = {
  mount(context) {
    currentContext = context;
    if (typeof ResizeObserver === "function") {
      tableLayoutObserver = new ResizeObserver(fitEgyptianWarTableContent);
      tableLayoutObserver.observe(egyptianWarArena);
      egyptianWarArena.addEventListener("transitionend", fitEgyptianWarTableContent);
    }
    currentSettings = context.launchData.settings ?? {};
    egyptianWarInputUnsubscribers = [
      context.input?.onAction("play-card", playEgyptianWarCard),
      context.input?.onAction("slap", slapEgyptianWarPile),
      context.input?.onBindingsChanged?.(updateEgyptianWarKeyHints),
      context.display?.onChange(applyEgyptianWarDisplay)
    ].filter(Boolean);
    updateEgyptianWarKeyHints();
    applyEgyptianWarDisplay();
    offlinePlayers = []; hostRecoveryDeadline = null;
    findEgyptianWarElement("#egyptian-war-reset-scores").hidden = !context.isHost || !context.resetScoreboard;
    showEgyptianWarGame(context.launchData);
    timerInterval = setInterval(renderEgyptianWarTurnTimer, 100);
    return {
      receiveState: renderEgyptianWarState,
      receiveEvent(event) {
        if (event.type === "notification") context.notify(event.payload?.message ?? "");
        if (event.type === "animation") activeEgyptianWarAnimation = event.payload;
        if (event.type === "pause-changed") {
          const paused = Boolean(event.payload?.isPaused);
          egyptianWarPauseButton.textContent = paused ? "Resume" : "Pause";
          egyptianWarPauseButton.setAttribute("aria-pressed", String(paused));
        }
      },
      receivePlatformEvent(event) {
        if (event.type === "host-changed") {
          egyptianWarHostControls.classList.toggle("d-none", !currentContext.isHost);
          findEgyptianWarElement("#egyptian-war-reset-scores").hidden = !currentContext.isHost || !currentContext.resetScoreboard;
          for (const seat of egyptianWarPlayers.children) {
            const actions = seat.querySelector(".egyptian-war-disconnected-actions");
            if (actions) { tableLayoutObserver?.unobserve(actions); actions.remove(); }
          }
          if (previousEgyptianWarState) renderEgyptianWarState(previousEgyptianWarState);
          renderSpectators(lastSpectators);
        }
        if (event.type === "host-status") {
          hostRecoveryDeadline = event.payload.recoveryDeadline;
          if (Number.isFinite(event.payload.serverNow)) offlineClockOffset = event.payload.serverNow - Date.now();
          renderOfflineStatus();
        }
        if (event.type === "scoreboard") renderScoreboard(event.payload);
        if (event.type === "spectators") renderSpectators(event.payload);
        if (event.type === "chat-message") renderChatMessage(event.payload);
      },
      destroy() {
        for (const unsubscribe of egyptianWarInputUnsubscribers) unsubscribe();
        egyptianWarInputUnsubscribers = [];
        destroyEgyptianWarGame();
        clearInterval(timerInterval);
        timerInterval = null;
        currentContext = null;
      }
    };
  }
};

globalScope.GameHubRegisterGameClientModule?.("egyptian-war", egyptianWarClientModule);
if (typeof module !== "undefined" && module.exports) {
  module.exports = { animateEgyptianWarOutcome, egyptianWarClientModule };
}
})(typeof window === "undefined" ? globalThis : window);
