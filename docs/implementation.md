# Egyptian War Implementation Notes

These notes describe how the package implements the behavior in
[the game design](design.md). Shared GameHub procedures are documented in the
collection's `GameHub/docs/game-plugin-architecture.md`.

## Source map

This document describes the current checkout, including unpublished changes.
The installed npm release can lag behind it. The game design and feature
checklist are maintained in [design.md](design.md).

| Responsibility | Source |
| --- | --- |
| Card types, game identity, rules, settings, bindings, themes, scoreboard columns, plugin manifest | [src/definition.ts](../src/definition.ts) |
| Deck creation, dealing, legal actions, challenges, penalties, removal, winner detection, public-state projection | [src/engine.ts](../src/engine.ts) |
| Slap candidate comparison and weighted selection | [src/slapArbitration.ts](../src/slapArbitration.ts) |
| Authoritative timers, arbitration collection, pause/reconnect handling, offline autoplay, animation locks, game completion | [src/session.ts](../src/session.ts) |
| Package exports and server plugin registration | [src/index.ts](../src/index.ts) |
| Board markup and responsive presentation | [public/template.html](../public/template.html), [public/style.css](../public/style.css) |
| Rendering, actions, animations, panel state, host-control updates | [public/client.js](../public/client.js) |
| Browser registration and game audio registration | [public/register.js](../public/register.js) |

## State and information boundaries

The server keeps player deck contents and order, the complete pile, deferred
cards, face-down penalty counts, challenge state, cooldowns, and winner state.
The browser receives public card counts, connection/elimination/turn indicators,
the top card and up to five recent face-up cards, challenge details, pile version,
action availability, pause/animation status, and turn time remaining. Session
snapshots also include server time and offline-player deadlines.

Spectators receive the same limited game-state projection. They cannot play or
slap, and no viewer receives hidden decks. The client submits action intent;
it cannot declare a slap valid, choose a winner, report its own score, or set
authoritative time. Public state never includes a live slappable flag. A matched
slap rule is explained only after the action resolves; when several rules match,
the server reports the first matching rule from its validation order.

The game has two engine states, `playing` and `finished`. Challenges, pending
pile awards, pause state, animation locks, and slap collection govern what may
happen within those states. Finishing notifies GameHub, which records the win
and returns the room to its lobby after the victory presentation.

## Runtime integration

Reconnecting players can receive a new socket ID. The session remaps that ID
while preserving the hand, challenge roles, pending pile winner, and applicable
turn grace. Server time and offline deadlines are included in state so clients
can render local countdowns.

The game declares `wins`, `slaps`, and `false-slaps` columns. Its session reports
resolved successful/false slaps through the optional `recordStat` service;
GameHub awards wins on completion. Losing contenders in a valid slap race and
ignored or rejected attempts do not count as false slaps. Rows sort by wins,
then successful slaps, then fewer false slaps, then player name.

The browser calls the optional `context.resetScoreboard` service. Asynchronous
play, slap, pause, kick, chat, and score-reset handlers capture their mount context
and ignore replies after that context has been destroyed or replaced. A successful
chat reply clears the draft only if the user has not changed it while waiting.
Score-reset confirmation and cancellation belong to the platform service
described in GameHub's architecture guide.

## Timing and verification reference

Slap collection lasts 300 ms. With the fixed server-controlled 25 ms uncertainty
per contender, candidates within 50 ms of the earliest receipt compete using
exponential weights favoring earlier receipt. Collection time is not a 300 ms
winning tie window, and display ping is not used to adjust results. A stale slap
can be forgiven within 350 ms only when it refers to the previous pile version
and that previous pile was slappable.

Session animation locks currently use 650 ms for card play, 1,050 ms for false
slaps, 2,400 ms for pile transfers, 3,600 ms for a final win, and 450 ms for the
remaining quick action path. A failed challenge ending on a slappable card uses
a four-second final slap window. Reduced motion changes presentation, not the
authoritative decision rules.

Engine, arbitration, and session tests live beside their TypeScript sources;
`test/` covers browser animation, panel/layout preferences, styles, and audio
registration. The package supports `npm run check`, `npm test`, and `npm run build`.
The [GitHub Actions workflow](../.github/workflows/verify.yml) runs on branch
pushes and pull requests using Node.js 24. It installs locked dependencies with
`npm ci`, runs type checks and tests, and checks the package with
`npm pack --dry-run` (which builds through `prepack`). It does not publish or
deploy the game.
Development checks need a Node version supported by the locked jsdom dependency:
22.22.2+ in Node 22, 24.15.0+ in Node 24, or Node 26+. The workflow uses Node 24.
This test-tool requirement does not change the game's declared Node >=20 runtime.

The development lockfile resolves jsdom's undici dependency to 8.12.3 to avoid
known advisories affecting earlier versions. This test-only update changes no
gameplay runtime files or published dependency declarations.
GameHub separately tests plugin loading, room permissions, reconnection, presets,
and score transport. Automated checks do not replace multiplayer/device testing.

## Player capacity and seating

The definition and engine accept 2-8 players. All cards are dealt round-robin,
so hand sizes differ by at most one card when the deck does not divide evenly.

The browser keeps equal-angle coordinates for the oval and separate rectangle
coordinates, selected by the board's aspect-ratio container query. Rectangle
slots run clockwise from the centered top seat, down the right edge, through
the centered bottom seat, and up the left edge. At eight players, each long
edge has three seats. Side slots avoid rounded corners. Long names truncate
visually while retaining their text and a title; dense oval seating uses smaller
seat surfaces to prevent overlap without changing its angles. Both coordinate
sets are available during resizing without waiting for another server snapshot.


## Responsive content and accepted limits

`fitEgyptianWarTableContent` measures seats and their disconnect controls to
bound the center content. Elimination badges overlay avatars, so becoming Out
does not change seat geometry. A stable grid separates the pile label, card
stack, and scrollable activity. New activity or challenge text resets scrolling;
identical snapshots preserve the reader's position, including timer updates.
Delayed slap-result messages use the same text-update helper.

For oval boards no taller than 220 CSS pixels, the center is narrower and uses
columns for the card and activity. Landscape viewports no taller than 500 pixels
also reduce the title's top margin gradually and share the turn row with offline
status. Rules initially collapse in short landscape, while saved preferences
remain authoritative. Side-panel width includes clearance for its external tools
when the panel and action buttons share the bottom row.

Several disconnect controls can still leave too little readable center space on
very short screens. For example, eight players with the top and bottom seats
disconnected at 740 by 360 pixels still produce a very small pile. This is an
accepted layout limit rather than a guarantee covered by the normal-size checks.

Recent verification includes browser checks of two through eight seats, live
aspect-ratio changes, stable activity/card placement, panel-tool clearance, and
late action replies after unmount. The host also verifies that a fresh production
install applies the package patch and matches the current runtime files. These
browser checks use desktop emulation, not physical mobile-device testing.

Rejected player removals preserve the running turn deadline. The session suspends
its timer only after the engine accepts a departure; invalid or already-departed
player IDs cannot stall the remaining players' turns.

A departure that awards the pile starts a full new turn even if its winner was
already the current player. The session detects the changed pile version as well
as a changed current player; unrelated departures retain the existing countdown.
Regression coverage includes a challenger leaving with one second remaining.

Disconnect recovery messages follow the actual pause state. If the host resumes
while multiple players are offline, a reconnect or an individual autoplay deadline
must not announce that the running game is paused. Running snapshots have no
pause message; manually paused games retain their waiting/resume guidance.

A live installed-package Edge match completed in 95 moves using a laptop keyboard
and phone-sized button controls. Settled snapshots conserved all 54 cards, and
the winner/game-ended path completed without browser script errors. This is one
emulated match rather than physical-device or comprehensive audio coverage.

Unmounting discards the transient chat input draft. Reusing the same page for a
new room must not expose an unsent message addressed to the previous room. Live
server history and browser-local display/rule preferences use separate storage
and are unaffected by clearing this input.

The polite, atomic turn live region changes its text only when the announcement
changes. Timer-only snapshots no longer replace the same text node and generate
redundant live-region mutations. MutationObserver regression coverage preserves
real turn/pause/winner updates; physical screen-reader output is not tested.


The verification workflow commands also pass in a clean Linux Node 24 container:
fresh registry installation, type checks, all 95 tests, and the package dry-run.
The source mount is read-only; generated files remain inside the disposable
container. This is local Linux verification, not a GitHub-hosted Actions result.


Expanded slap rules now keep their top-left position and scroll within the space
above horizontally overlapping seats. The existing table-layout pass computes
the list height from seat bounds; Show/Hide also refits it immediately. Saved
expansion choices and table/button positions are unchanged. Geometry regression
coverage checks refitting, and Edge measurements cover default/all rules with
eight players at 1920x1080, 1366x768, 1280x800, 1024x768, 390x844, and 360x640.
