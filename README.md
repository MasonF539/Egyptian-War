# Egyptian War for GameHub

This repository contains the server-authoritative Egyptian War game plugin
for GameHub.

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
The package's public state also states whether the current player may legally
play a card, keeping the action disabled during the final slap window after a
failed challenge. Its numeric countdown stays fixed at the right edge inside
the full-width timer track while the yellow fill passes beneath it, and the
complete timer scales with the action controls on narrow screens.

The package consumes an exact `@masonf539/game-sdk` release. Once both packages
are published, GameHub installs an exact Egyptian War version and enables it
through `gamehub.config.json`. GameHub's `npm run verify:packages` command
currently verifies that both packed artifacts work without monorepo source.

## Slap rules and penalties

Slap patterns are validated by the server and configured in the lobby. The
"Three in a Row" pattern checks the latest three cards for an ascending or
descending rank sequence, including Ace-low and Ace-high sequences. The
"Tens" pattern checks only two directly adjacent number cards that total ten;
an Ace counts as one. An active player who false-slaps forfeits the configured
number of cards, up to the number they hold. An eliminated player has no cards
to forfeit, so a false slap prevents them from slapping the unchanged pile
again. The cooldown clears when the next card is played, allowing that card to
be slapped and the eliminated player to re-enter immediately.

## Installation preparation

The repository includes its own README, license, TypeScript settings, tests,
public assets, package metadata, and ignore rules. Its only GameHub code
dependency is the exact `@masonf539/game-sdk` version declared in `package.json`.
A lockfile will be generated after that SDK version is published so it records
the registry artifact rather than the former monorepo workspace link.
