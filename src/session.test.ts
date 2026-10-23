import assert from "node:assert/strict";
import test from "node:test";
import type {
  GameEvent,
  GameMember,
  GameSessionContext
} from "@masonf539/game-sdk";
import type { Card } from "./definition.js";
import {
  isEgyptianWarStateSlappable,
  type EgyptianWarState,
  type PublicEgyptianWarState
} from "./engine.js";
import { egyptianWarServer } from "./session.js";
import { slapCollectionWindowMs } from "./slapArbitration.js";

const settings = {
  deckCount: 1,
  includeJokers: true,
  allowDoubles: true,
  allowSandwiches: true,
  allowThreeInARow: true,
  allowTopBottom: true,
  allowTens: true,
  allowMarriage: true,
  falseSlapPenaltyCards: 2,
  turnTimerSeconds: 120
};

function internals(session: unknown): { state: EgyptianWarState } {
  return session as { state: EgyptianWarState };
}

function card(rank: Card["rank"], id: string): Card {
  return { id, rank, suit: rank === "joker" ? null : "clubs" };
}

function makeSession(playerCount = 3, overrides: Record<string, number | boolean> = {}) {
  const names = ["host", "guest", "third"];
  const members: GameMember[] = names.slice(0, playerCount).map((id) => ({
    id,
    name: id,
    avatar: "\u{1F431}",
    isConnected: true,
    role: "player"
  }));
  const events: GameEvent[] = [];
  const stats: Array<{ memberId: string; key: string }> = [];
  const context: GameSessionContext & { recordStat: (memberId: string, key: string) => void } = {
    recordStat: (memberId, key) => { stats.push({ memberId, key }); },
    roomCode: "TEST01",
    members: () => members,
    broadcastState: () => {},
    emitEvent: (event) => events.push(event),
    finish: () => {},
    now: Date.now,
    randomInteger: (maxExclusive) => maxExclusive - 1
  };
  const session = egyptianWarServer.createSession(context, { ...settings, ...overrides });
  return { session, events, members, stats };
}

test("offline players auto-play after the wait and reconnect into their existing hand", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { session, members, events } = makeSession(3, { offlineAutoPlay: true, offlineGraceSeconds: 60 });
  try {
    const current = internals(session).state.players[internals(session).state.currentPlayerIndex];
    const member = members.find((member) => member.id === current.id)!;
    const count = current.cards.length;
    session.start?.();
    member.isConnected = false;
    session.memberDisconnected?.(member.id);
    assert.equal(session.getLifecycleState().isPaused, true);
    assert.match(JSON.stringify(events.find((event) => event.type === "notification")), /60 seconds/);
    t.mock.timers.tick(59_999);
    assert.equal(current.cards.length, count);
    t.mock.timers.tick(1);
    assert.equal(session.getLifecycleState().isPaused, false);
    t.mock.timers.tick(1000);
    assert.equal(current.cards.length, count - 1);
    member.isConnected = true;
    session.memberReconnected?.(member.id);
    assert.ok(internals(session).state.players.some((player) => player.id === member.id));
    assert.equal(current.cards.length, count - 1);
  } finally { session.dispose(); }
});

test("offline grace preserves a manual pause and waits for every missing player", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { session, members } = makeSession(3, { offlineAutoPlay: true });
  try {
    members[0]!.isConnected = false;
    session.memberDisconnected?.(members[0]!.id);
    t.mock.timers.tick(30_000);
    members[1]!.isConnected = false;
    session.memberDisconnected?.(members[1]!.id);
    t.mock.timers.tick(30_000);
    assert.equal(session.getLifecycleState().isPaused, true);
    session.pause?.();
    t.mock.timers.tick(30_000);
    assert.equal(session.getLifecycleState().isPaused, true);
    assert.equal(session.resume?.().success, true);
    assert.equal(session.getLifecycleState().isPaused, false);
    assert.equal(session.pause?.().success, true);
    assert.equal(session.getLifecycleState().isPaused, true);
  } finally { session.dispose(); }
});

test("reconnecting cancels offline takeover and disabling it keeps the game paused", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  for (const enabled of [true, false]) {
    const { session, members } = makeSession(3, { offlineAutoPlay: enabled });
    try {
      members[0]!.isConnected = false;
      session.memberDisconnected?.(members[0]!.id);
      if (enabled) {
        t.mock.timers.tick(30_000);
        members[0]!.isConnected = true;
        session.memberReconnected?.(members[0]!.id);
        session.pause?.();
      }
      t.mock.timers.tick(120_000);
      assert.equal(session.getLifecycleState().isPaused, true);
    } finally { session.dispose(); }
  }
});

function deal(session: unknown, hands: Card[][], pile: Card[]): void {
  const state = internals(session).state;
  state.players.forEach((player, index) => {
    player.cards = hands[index] ?? [];
    player.isEliminated = player.cards.length === 0;
  });
  state.pile = pile;
  state.penaltyPileCardCount = 0;
  state.currentPlayerIndex = 0;
  state.totalCardCount =
    hands.reduce((total, hand) => total + hand.length, 0) + pile.length;
}

function animationEvents(events: GameEvent[]): Array<Record<string, unknown>> {
  return events
    .filter((event) => event.type === "animation")
    .map((event) => event.payload as Record<string, unknown>);
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 5_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the Egyptian War session.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("accepted slaps survive a disconnect pause", { timeout: 30_000 }, async () => {
  const members: GameMember[] = [
    {
      id: "host",
      name: "Host",
      avatar: "\u{1F431}",
      isConnected: true,
      role: "player"
    },
    {
      id: "guest",
      name: "Guest",
      avatar: "\u{1F436}",
      isConnected: true,
      role: "player"
    }
  ];
  const events: GameEvent[] = [];
  const context: GameSessionContext = {
    roomCode: "TEST01",
    members: () => members,
    broadcastState: () => {},
    emitEvent: (event) => events.push(event),
    finish: () => {},
    now: Date.now,
    randomInteger: (maxExclusive) => maxExclusive - 1
  };
  const session = egyptianWarServer.createSession(context, settings);
  const state = (): PublicEgyptianWarState =>
    session.getPublicState({ memberId: "host", role: "player" }) as
      PublicEgyptianWarState;

  try {
    session.start?.();
    for (let turns = 0; turns < 54; turns += 1) {
      await waitUntil(() => !state().isAnimating);
      const current = state();
      if (isEgyptianWarStateSlappable(internals(session).state)) break;
      assert.ok(current.currentPlayerId);
      const result = await session.handleAction(current.currentPlayerId, {
        type: "play-card"
      });
      assert.equal(result.success, true);
    }

    assert.equal(
      isEgyptianWarStateSlappable(internals(session).state),
      true,
      "expected a valid slap"
    );
    assert.equal((await session.handleAction("host", { type: "slap" })).success, true);

    const pauseResult = session.pause?.();
    assert.equal(pauseResult?.success, false);
    assert.match(pauseResult?.message ?? "", /slap decision/i);

    assert.equal((await session.handleAction("guest", { type: "slap" })).success, true);
    members[1].isConnected = false;
    session.memberDisconnected?.("guest");

    await waitUntil(() => events.some(
      (event) =>
        event.type === "animation" &&
        typeof event.payload === "object" &&
        event.payload !== null &&
        "action" in event.payload &&
        event.payload.action === "slap"
    ));
    const slapEvent = [...events].reverse().find(
      (event) =>
        event.type === "animation" &&
        typeof event.payload === "object" &&
        event.payload !== null &&
        "action" in event.payload &&
        event.payload.action === "slap"
    );
    assert.ok(slapEvent);
    const payload = slapEvent.payload as {
      slapAttempts: Array<{
        playerId: string;
        delayMs: number;
        isWinner: boolean;
      }>;
    };
    assert.equal(payload.slapAttempts.length, 2);
    assert.equal(
      payload.slapAttempts.filter((attempt) => attempt.isWinner).length,
      1
    );
    assert.ok(
      payload.slapAttempts.every((attempt) => Number.isFinite(attempt.delayMs))
    );
    assert.equal(state().isPaused, true);
  } finally {
    session.dispose();
  }
});

test("slaps are accepted while a card-play animation is running", { timeout: 15_000 }, async () => {
  const { session, events } = makeSession();

  try {
    deal(
      session,
      [
        [card("9", "h-9"), card("4", "h-4"), card("5", "h-5")],
        [card("8", "g-8"), card("3", "g-3"), card("6", "g-6")],
        [card("7", "t-7"), card("10", "t-10"), card("2", "t-2")]
      ],
      [card("9", "pile-9")]
    );
    session.start?.();

    // The host's 9 lands on a 9 (a double). The 650 ms card animation starts.
    assert.equal((await session.handleAction("host", { type: "play-card" })).success, true);
    assert.equal(session.getLifecycleState?.().isBusy, true);

    const early = await session.handleAction("guest", { type: "slap" });
    assert.equal(early.success, true, "a slap during the card animation must be collected");

    await waitUntil(() => animationEvents(events).some((event) => event.action === "slap"));
    const slap = animationEvents(events).find((event) => event.action === "slap");
    assert.equal(slap?.winnerId, "guest");
    assert.equal(internals(session).state.pile.length, 0);

    const cardPlay = animationEvents(events).find((event) => event.action === "play-card");
    assert.equal(cardPlay?.durationMs, 650);
    assert.equal(cardPlay?.allowsSlaps, true);
  } finally {
    session.dispose();
  }
});

test("an eliminated player's invalid slap animates once and starts its cooldown", { timeout: 15_000 }, async () => {
  const { session, events } = makeSession();

  try {
    deal(
      session,
      [
        [card("4", "h-4"), card("5", "h-5")],
        [card("6", "g-6"), card("7", "g-7")],
        []
      ],
      [card("2", "pile-2"), card("9", "pile-9")]
    );
    session.start?.();

    const result = await session.handleAction("third", { type: "slap" });
    assert.equal(result.success, true);
    assert.equal(internals(session).state.players[2].slapCooldownUntilCardPlayCount, 3);
    assert.equal(session.getLifecycleState?.().isBusy, true);
    const slapAnimations = animationEvents(events).filter(
      (event) => event.action === "slap"
    );
    assert.equal(slapAnimations.length, 1);
    assert.equal(slapAnimations[0]?.actorId, "third");
    assert.equal(slapAnimations[0]?.isValidSlap, false);
    assert.deepEqual(slapAnimations[0]?.slapAttempts, []);

    const repeated = await session.handleAction("third", { type: "slap" });
    assert.equal(repeated.success, false);
    assert.match(repeated.message ?? "", /3 more card placements/i);
    assert.equal(
      animationEvents(events).filter((event) => event.action === "slap").length,
      1
    );
  } finally {
    session.dispose();
  }
});

test("a false slap that eliminates a player blocks only the unchanged card", { timeout: 15_000 }, async () => {
  const { session } = makeSession(3, { falseSlapPenaltyCards: 1 });

  try {
    deal(
      session,
      [
        [card("5", "h-last")],
        [card("2", "g-2"), card("8", "g-8")],
        [card("9", "t-9")]
      ],
      [card("2", "pile-2"), card("3", "pile-3")]
    );
    session.start?.();

    const falseSlap = await session.handleAction("host", { type: "slap" });
    assert.equal(falseSlap.success, true);
    assert.equal(internals(session).state.players[0].isEliminated, true);
    assert.equal(internals(session).state.players[0].slapCooldownUntilCardPlayCount, 1);
    await waitUntil(() => session.getLifecycleState?.().isBusy === false);

    const repeated = await session.handleAction("host", { type: "slap" });
    assert.equal(repeated.success, false);
    assert.match(repeated.message ?? "", /1 more card placement/i);

    assert.equal((await session.handleAction("guest", { type: "play-card" })).success, true);
    assert.equal((await session.handleAction("host", { type: "slap" })).success, true);
    await waitUntil(() => internals(session).state.players[0].cards.length > 0);
    assert.equal(internals(session).state.players[0].slapCooldownUntilCardPlayCount, null);
    assert.equal(internals(session).state.players[0].isEliminated, false);
  } finally {
    session.dispose();
  }
});

test("an eliminated player's cooldown skips two cards and allows a slap on the third", { timeout: 15_000 }, async () => {
  const { session } = makeSession();

  try {
    deal(
      session,
      [
        [card("2", "h-2"), card("2", "h-2b"), card("8", "h-8")],
        [card("9", "g-9"), card("7", "g-7")],
        []
      ],
      [card("2", "pile-2"), card("3", "pile-3")]
    );
    session.start?.();

    const falseSlap = await session.handleAction("third", { type: "slap" });
    assert.equal(falseSlap.success, true);
    assert.equal(internals(session).state.players[2].slapCooldownUntilCardPlayCount, 3);
    await waitUntil(() => session.getLifecycleState?.().isBusy === false);

    assert.equal((await session.handleAction("host", { type: "play-card" })).success, true);
    assert.match(
      (await session.handleAction("third", { type: "slap" })).message ?? "",
      /2 more card placements/i
    );
    await waitUntil(() => session.getLifecycleState?.().isBusy === false);

    assert.equal((await session.handleAction("guest", { type: "play-card" })).success, true);
    assert.match(
      (await session.handleAction("third", { type: "slap" })).message ?? "",
      /1 more card placement/i
    );
    await waitUntil(() => session.getLifecycleState?.().isBusy === false);

    // The host's second 2 creates a sandwich on the third card opportunity.
    assert.equal((await session.handleAction("host", { type: "play-card" })).success, true);
    const slap = await session.handleAction("third", { type: "slap" });
    assert.equal(slap.success, true);
    await waitUntil(() => internals(session).state.players[2].cards.length > 0);
    assert.equal(internals(session).state.players[2].slapCooldownUntilCardPlayCount, null);
    assert.equal(internals(session).state.players[2].isEliminated, false);
  } finally {
    session.dispose();
  }
});

test("a slap that lost a race with a card play is forgiven, a late one is not", { timeout: 15_000 }, async () => {
  const { session } = makeSession();

  try {
    deal(
      session,
      [
        [card("4", "h-4"), card("5", "h-5"), card("6", "h-6")],
        [card("8", "g-8"), card("3", "g-3"), card("7", "g-7"), card("10", "g-10")],
        [card("2", "t-2"), card("jack", "t-jack"), card("queen", "t-queen")]
      ],
      [card("9", "pile-9a"), card("9", "pile-9b")]
    );
    const state = internals(session).state;
    session.start?.();

    const seenVersion = state.pileVersion;
    // The host answers the double with a plain card instead of slapping.
    assert.equal((await session.handleAction("host", { type: "play-card" })).success, true);
    assert.equal(state.pileVersion, seenVersion + 1);

    const guestCards = state.players[1].cards.length;
    const forgiven = await session.handleAction("guest", {
      type: "slap",
      payload: { pileVersion: seenVersion }
    });
    assert.equal(forgiven.success, false);
    assert.match(forgiven.message ?? "", /no penalty/i);
    assert.equal(state.players[1].cards.length, guestCards);

    // Once the animation and the grace period are over, a stale slap is a false slap.
    await new Promise((resolve) => setTimeout(resolve, 800));
    await waitUntil(() => !(session.getPublicState({ memberId: "guest", role: "player" }) as PublicEgyptianWarState).isAnimating);
    const late = await session.handleAction("guest", {
      type: "slap",
      payload: { pileVersion: seenVersion }
    });
    assert.equal(late.success, true);
    assert.equal(state.players[1].cards.length, guestCards - 2);
  } finally {
    session.dispose();
  }
});

test("the final-card slap window is much shorter than a full turn", () => {
  const { session } = makeSession();

  try {
    const viewer = { memberId: "host", role: "player" } as const;
    const normal = session.getPublicState(viewer) as PublicEgyptianWarState;
    assert.equal(normal.turnTimerSeconds, 120);

    internals(session).state.pendingPileWinnerId = "host";
    const windowState = session.getPublicState(viewer) as PublicEgyptianWarState;
    assert.equal(windowState.turnTimerSeconds, 4);
  } finally {
    session.dispose();
  }
});

test("offline takeover does not reset a connected player's running turn after an early resume", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { session, members } = makeSession(3, { turnTimerSeconds: 15 });
  try {
    const state = internals(session).state;
    const missing = members.find((member) => member.id !== state.players[state.currentPlayerIndex].id)!;
    session.start?.();
    missing.isConnected = false;
    session.memberDisconnected?.(missing.id);
    t.mock.timers.tick(55_000);
    session.resume?.();
    t.mock.timers.tick(4_000);
    const viewer = { memberId: "host", role: "player" } as const;
    assert.equal((session.getPublicState(viewer) as PublicEgyptianWarState).turnTimeRemainingMs, 11_000);
    t.mock.timers.tick(1_000);
    assert.equal((session.getPublicState(viewer) as PublicEgyptianWarState).turnTimeRemainingMs, 10_000);
  } finally { session.dispose(); }
});

test("offline takeover shortens the missing player's running turn after an early resume", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { session, members } = makeSession(3, { turnTimerSeconds: 15 });
  try {
    const state = internals(session).state;
    const current = state.players[state.currentPlayerIndex];
    session.start?.();
    members.find((member) => member.id === current.id)!.isConnected = false;
    session.memberDisconnected?.(current.id);
    t.mock.timers.tick(55_000);
    session.resume?.();
    t.mock.timers.tick(5_000);
    const viewer = { memberId: "host", role: "player" } as const;
    assert.equal((session.getPublicState(viewer) as PublicEgyptianWarState).turnTimeRemainingMs, 1000);
    const count = current.cards.length;
    t.mock.timers.tick(1000);
    assert.equal(current.cards.length, count - 1);
  } finally { session.dispose(); }
});

test("a winner reconnecting during the victory animation retains the winner identity", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { session, members, events } = makeSession(2);
  try {
    members[1].isConnected = false;
    assert.equal(session.memberRemoved?.("guest").success, true);
    assert.equal(internals(session).state.status, "finished");
    const animation = events.find((event) => event.type === "animation")?.payload as { durationMs: number };
    assert.ok(animation.durationMs > 0);
    members[0].id = "host-new";
    session.memberReconnected?.("host-new", "host");
    const state = session.getPublicState({ memberId: "host-new", role: "player" }) as PublicEgyptianWarState;
    assert.equal(state.winnerId, "host-new");
    assert.equal(state.players.find((player) => player.id === state.winnerId)?.name, "host");
    t.mock.timers.tick(animation.durationMs);
    assert.equal(internals(session).state.winnerId, "host-new");
  } finally { session.dispose(); }
});

test("disconnect deadlines stay stable and server-resolved slaps report statistics with explanations", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { session, members, stats } = makeSession();
  try {
    const viewer = { memberId: "host", role: "player" } as const;
    const state = internals(session).state;
    state.pile = [card("2", "first"), card("2", "second")];
    state.penaltyPileCardCount = 0;
    const publicBefore = session.getPublicState(viewer) as Record<string, unknown>;
    assert.equal(publicBefore.slapReason, undefined);
    const slap = session.handleAction("host", { type: "slap" });
    t.mock.timers.tick(slapCollectionWindowMs);
    assert.equal((await slap).success, true);
    assert.deepEqual(stats, [{ memberId: "host", key: "slaps" }]);
    assert.match(state.activityMessage, /Slap rule: Double/);
    members[1].isConnected = false;
    session.memberDisconnected?.("guest");
    const first = session.getLifecycleState() as unknown as { disconnections: Array<{ autoPlayAt: number; autoPlaying: boolean }> };
    const deadline = first.disconnections[0].autoPlayAt;
    t.mock.timers.tick(10_000);
    const later = session.getLifecycleState() as unknown as typeof first;
    assert.equal(later.disconnections[0].autoPlayAt, deadline);
    t.mock.timers.tick(50_000);
    assert.equal((session.getLifecycleState() as unknown as typeof first).disconnections[0].autoPlaying, true);
  } finally { session.dispose(); }
});


test("a rejected removal preserves the running turn deadline", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { session } = makeSession(3, { turnTimerSeconds: 15 });
  try {
    const current = internals(session).state.players[internals(session).state.currentPlayerIndex];
    const count = current.cards.length;
    session.start?.();
    t.mock.timers.tick(5_000);
    assert.equal(session.memberRemoved?.("already-left", { voluntary: true }).success, false);
    t.mock.timers.tick(9_999);
    assert.equal(current.cards.length, count);
    t.mock.timers.tick(1);
    assert.equal(current.cards.length, count - 1);
  } finally { session.dispose(); }
});


for (const removedId of ["host", "third"]) {
  test(`removing ${removedId === "host" ? "the challenger starts a fresh turn" : "an unrelated player preserves the challenge deadline"}`, (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const { session } = makeSession(3, { turnTimerSeconds: 15 });
    try {
      deal(session, [
        [card("2", "h2"), card("3", "h3")],
        [card("4", "g4"), card("5", "g5")],
        [card("6", "t6"), card("7", "t7")]
      ], [card("queen", "pq")]);
      const state = internals(session).state;
      state.currentPlayerIndex = 1;
      state.challenge = { challengerId: "host", responderId: "guest", attemptsRemaining: 2 };
      session.start?.();
      t.mock.timers.tick(14_000);
      assert.equal(session.memberRemoved?.(removedId, { voluntary: true }).success, true);
      assert.equal(state.players[state.currentPlayerIndex].id, "guest");
      const snapshot = session.getPublicState({ memberId: "guest", role: "player" }) as PublicEgyptianWarState;
      assert.equal(snapshot.turnTimeRemainingMs, removedId === "host" ? 15_000 : 1_000);
    } finally { session.dispose(); }
  });
}


for (const recovery of ["reconnect", "deadline"]) {
  test(`a host's early resume stays reflected in ${recovery} messages with another player offline`, (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const { session, members } = makeSession();
    try {
      session.start?.();
      members[0].isConnected = false;
      session.memberDisconnected?.("host");
      t.mock.timers.tick(30_000);
      members[1].isConnected = false;
      session.memberDisconnected?.("guest");
      session.resume?.();
      if (recovery === "reconnect") {
        members[0].isConnected = true;
        session.memberReconnected?.("host");
      } else {
        t.mock.timers.tick(30_000);
      }
      const snapshot = session.getPublicState({ memberId: "third", role: "player" }) as PublicEgyptianWarState;
      assert.equal(snapshot.isPaused, false);
      assert.match(snapshot.activityMessage, /game is continuing/i);
      assert.equal(snapshot.pauseMessage, null);
    } finally { session.dispose(); }
  });
}
