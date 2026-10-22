# Egyptian War for GameHub

This repository contains the server-authoritative Egyptian War game plugin
for GameHub.

See [Game design](docs/design.md) for the rules, settings, player experience,
and interface. [Implementation notes](docs/implementation.md) cover source
locations, internal state, runtime integration, and exact timing constants.

Egyptian War is designed to be installed and run by GameHub through the
`@masonf539/game-sdk` contracts. It is independently versioned, but it is not a
standalone web application and depends on GameHub for rooms, networking, the
lobby, shared settings, and browser hosting.

The package owns its rules, state engine, slap arbitration, tests, browser
presentation, game-specific audio, preview media, and design documentation.
GameHub supplies rooms, members, spectators, transport, and shared services.

`src/session.ts` owns the authoritative runtime lifecycle, including turn
timers, slap collection, pause/disconnect recovery, animations, member
removal, and completion. `public/client.js` owns the browser controller and
registers it with GameHub's generic client host.

Game-specific music, effects, and picker previews live under `public/assets`
and are served by GameHub from `/games/egyptian-war`.
The package-owned `public/register.js` registers those sounds with GameHub's
shared audio service.
The game board lives in `public/template.html`, and its presentation lives in
`public/style.css`. GameHub injects the fragment into a package-specific root;
the browser controller scopes its element lookups to that root.
The table adapts to the space above the action controls: a taller board uses a
rounded rectangular table with a continuous wooden rail and no pockets; a wider
board keeps the oval table. Player seats follow the selected shape, while the
turn label, timer, and buttons stay below the board.
During active play, the stylesheet fixes the board to the available viewport,
accounts for mobile safe areas, and keeps its compact Pause/connection row
below GameHub's Settings shortcut. Full Screen and confirmed Exit/Leave
actions remain platform-owned controls in GameHub's reusable Game tab. The
shortcut is mounted inside the active game viewport, while the Settings tabs
move into one horizontal row at medium and small widths.
Egyptian War declares `play-card` and `slap` input actions for GameHub's
package-aware Keybinds tab. Their defaults are E and Space respectively, and
the game subscribes through the shared input service so remapping remains a
personal GameHub preference.
Buttons show the current bindings for keyboard users. GameHub's Game settings
also offer personal card styles and table colors with previews. Animation timing
is shared, with support for the device's reduced-motion accessibility preference.

By default, a disconnected player pauses the game for up to 60 seconds before
automatic play takes over their turns. The host can resume early or keep the
game manually paused, and a returning player retains their hand and control.
The lobby settings can change this waiting time or disable takeover. Multiple
offline players each receive their own waiting period. GameHub's host recovery
timeout transfers control to a connected player, closing the room only when no
eligible successor is available. The host can also transfer control manually.
The package's public state also states whether the current player may legally
play a card, keeping the action disabled during the final slap window after a
failed challenge. Its numeric countdown stays fixed at the right edge inside
the full-width timer track while the yellow fill passes beneath it, and the
complete timer scales with the action controls on narrow screens.

The package declares `@masonf539/game-sdk@^1.0.0 || ^1.1.0-beta.0` as a peer dependency so GameHub
and its games share one SDK installation. Once both packages
are published, GameHub installs an exact Egyptian War version and enables it
through `gamehub.config.json`. GameHub's `npm run verify:packages` command
currently verifies that both packed artifacts work without monorepo source.

The side panel's Scoreboard tab shows room wins, successful slaps and false
slaps. Totals are held by GameHub only for the room lifetime and persist across
restarts and reconnects. Hosts can reset them. Slap explanations identify the
matched rule after resolution, or explain the penalty for a false slap. The
fixed status line shows offline auto-play deadlines and the current pause state.

## Slap rules and penalties

Slap patterns are validated by the server and configured in the lobby. The
"Three in a Row" pattern checks the latest three cards for an ascending or
descending rank sequence, including Ace-low and Ace-high sequences. The
"Tens" pattern checks only two directly adjacent number cards that total ten;
an Ace counts as one. An active player who false-slaps forfeits the configured
number of cards, up to the number they hold. A false slap by an eliminated
player, or one that forfeits a player's last card, prevents another slap on the
unchanged pile. A newly eliminated player may try once on the next played card.
If an eliminated player false-slaps, they must skip the next two played cards
and may try again when the third card is placed.
Invalid reentry attempts use the same visible one-hand slap animation as other
false slaps; additional attempts during the cooldown do not create extra hands.

## Installation preparation

The repository includes its own README, license, TypeScript settings, tests,
public assets, package metadata, and ignore rules. Its only GameHub code
dependency is the compatible `@masonf539/game-sdk` peer range in `package.json`.
The lockfile records the published SDK artifact used for development and tests.
