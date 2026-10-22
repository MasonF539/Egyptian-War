# Egyptian War Design

Egyptian War is a versioned game plugin made for GameHub. The package owns the
game-specific server and browser behavior, while GameHub provides the room,
transport, lobby, spectator, and hosting services required to run it.

## Game overview

Egyptian War is a multiplayer reaction card game. Players reveal cards into a
shared pile, answer face-card challenges, and race to slap enabled patterns.
A successful slap wins the pile and can bring a player with no cards back into
the game. False slaps carry penalties.

- Game name: Egyptian War
- Number of players: 2-8
- Typical game length: Not yet measured; varies with players, decks, and rules.
- Player objective: Win piles and collect every card.
- Winning condition: One player collects all cards after any remaining valid
  reentry slap opportunity resolves.

## Intended player experience

Players should feel attentive and involved even between their own turns. The
public pile creates moments of recognition and urgency: a newly played card can
open a slap opportunity for anyone, including someone who has run out of cards.
Face-card challenges add anticipation as the responder tries to avoid losing
the pile. Winning a pile should feel like a meaningful reversal of fortune.

The rules and feedback should make consequences understandable. False-slap
penalties create risk, while post-action explanations help players learn why
an attempt succeeded or failed. The game should remain readable and usable
on phones as well as larger screens.

## Design priorities

1. **Keep everyone involved.** Allow slaps outside the player's turn and preserve
   reentry opportunities for players without cards, subject to the existing
   cooldown rules. Players should still have reasons to watch the pile.
2. **Make pressure readable.** Keep the current turn, challenge, timer, and action
   availability clear. Explain resolved slaps without announcing live matches
   or revealing hidden decks.
3. **Keep decisions authoritative and consistent.** Resolve rules, timers,
   competing slaps, penalties, and scores on the server. Client clocks and
   display ping must not determine outcomes or supply hidden information.
4. **Support a continuous room session.** Preserve hands through reconnection,
   offer controlled offline autoplay and host handoff, and keep layouts and
   controls usable as screen dimensions change. Manual pauses remain respected.

## Hidden information and spectators

Players can see names, avatars, card counts, whose turn it is, connection status,
challenge details, and the visible pile. Deck contents and order stay hidden
from everyone. Spectators see the same public information and cannot play or
slap. Rule explanations appear after a slap resolves; the interface does not
announce live slap opportunities.

Source locations, state fields, and integration details are recorded in
[implementation notes](implementation.md).

## Settings reference

These defaults come from `src/definition.ts`. They are shared room rules chosen
before a match, unlike personal presentation preferences.

| Setting key | Default | Allowed values |
| --- | --- | --- |
| `deckCount` | 1 | 1, 2, 3 standard decks |
| `includeJokers` | Enabled | Adds two Jokers per deck |
| `allowDoubles` | Enabled | Two adjacent matching ranks |
| `allowSandwiches` | Enabled | Matching ranks with one card between |
| `allowThreeInARow` | Enabled | Three ascending or descending ranks, including Ace-low or Ace-high |
| `allowTopBottom` | Disabled | Newest face-up card matches the first face-up card |
| `allowTens` | Disabled | Two adjacent number cards total ten; Ace counts as one |
| `allowMarriage` | Disabled | Adjacent King and Queen in either order |
| `falseSlapPenaltyCards` | 2 | 1, 2, 3 cards |
| `turnTimerSeconds` | 15 seconds | 5-120 seconds, increments of 1 |
| `offlineAutoPlay` | Enabled | Automatic turns after an offline waiting period |
| `offlineGraceSeconds` | 60 seconds | 15-300 seconds, increments of 5 |

An exposed Joker is always slappable when Jokers are in the deck. Face-down
penalties and deferred cards do not contribute to any slap pattern. Winning a
pile adds its cards to the bottom of the winner's deck without shuffling.
Challenge cards require Jack: 1, Queen: 2, King: 3, Ace: 4, or Joker: 5 response
attempts. A new challenge card replaces the existing challenge.

### Personal preferences and presets

Rule configurations can be saved using GameHub's presets.

Personal card styles are Classic, Modern, and Midnight; table colors are Emerald,
Ocean, and Burgundy. Classic and Emerald are the defaults. These choices affect
only the viewer's presentation. Animation timing is shared, and presentation
honors system reduced-motion settings.

## Offline players and host ownership

A disconnect pauses active play. With the default settings, a player becomes
eligible for automatic turns after 60 seconds. Each offline player has their own
deadline. If several players disconnect, automatic resumption waits until none
is still in their waiting period. The fixed status line shows pause/running state,
player names, countdowns, and autoplay status, using server time for countdowns.

The host may resume early or manually keep the game paused. Expiry of the offline
waiting period does not override a manual pause, including a pause made before
disconnection. When autoplay is eligible, an offline player's ordinary turn is
limited to at most one second; the final slap-window timing remains separate.
Reconnection cancels that player's takeover and restores their existing hand.
Reconnecting on the current turn allows one grace period of up to five seconds
per turn, capped at the configured turn duration.

Changing hosts preserves the current match, hands, and scores. The new host can
pause, resume, and manage disconnected players. Host transfer and offline
autoplay have separate deadlines.

## Room scoreboard and social panel

The scoreboard tracks wins, successful slaps, and false slaps. Losing a valid slap
race, or having an attempt ignored or rejected, does not count as a false slap.
Rows sort by wins, then successful slaps, then fewer false slaps, then player name.
Totals continue across matches and reconnects in the same room, and clear when
the room closes or the server stops.

Scoreboard access is inside this game's side panel, alongside Chat and Spectators.
The Room Totals header has a host-only Reset totals button at its top right.
Resetting requires confirmation; cancelling preserves the totals.

Players and spectators share room chat. The panel supports medium, expanded,
and minimized modes, remembers its size, and uses a dark side extension for
expand/minimize controls. Chat, Spectators, and Scoreboard tabs have equal
widths and keyboard navigation. The spectator list shows who is watching and
their connection status.

## Current layout and controls

The usable board area sits above the turn label, timer, and action buttons. Its
own aspect ratio chooses a tall, rounded rectangular pool-table shape without
pockets when taller than wide, and the oval table when wider than tall. Player
seats use equal angles around the oval. The rectangle keeps one seat centered
on each short end and distributes the others along its flat long sides (three
on each side with eight players), keeping
clockwise turn order and leaving corners clear. The title stays at the top and
the action controls remain below the arena. Size changes respond to available width and height.

Slap Rules stays in the upper-left corner and remembers its collapsed state.
Narrow screens initially collapse the rules and minimize the side panel when no
saved layout preference exists. Short landscape screens also start with the
rules collapsed unless a saved preference overrides that choice. Opening the
panel restores its saved size.
The turn label uses fixed-height space above the timer, aligns to the timer's
right edge, and remains an `aria-live` region. It says "It's your turn" for the
local player and names the current player for other viewers.

The default controls are E for Play a Card and Space for Slap. Keyboard users
see keycap hints that follow their chosen bindings; touch users keep the
tap-oriented subtitle.
The side panel overlays part of the play area, with its controls on an external
side extension. On portrait phones, the open panel overlays only the board area,
keeping the turn label, timer, and action buttons accessible. Opening or expanding
the panel keeps those controls at the same size when it sits above them. The
pile count, card stack, and activity messages use stable spaces: long messages
scroll without moving or resizing the cards or covering player seats. New
activity returns its scroll area to the top; unchanged timer updates preserve
manual scrolling. Elimination badges do not change seat height.

On short oval tables, activity sits beside the card stack and the header uses
less vertical space. When the side panel sits beside the actions, its width
reserves room for the external tool buttons. At extremely small sizes, several
disconnect labels can still reduce the center space substantially. That crowding
is an accepted limit for now; the layout does not promise readable cards in
every combination of viewport size and disconnected seats.

## Slap timing and action pacing

Valid competing slaps are collected for 300 ms, with contenders within 50 ms of
the earliest server receipt eligible to win. Weighted selection favors earlier
arrivals; display ping does not adjust the result. A slap that narrowly loses
a race with a newly played card can be forgiven when the previous pile offered
a valid slap.

A failed challenge ending on a slappable card opens a four-second final slap
window. Card plays, penalties, pile transfers, and wins have presentation
animations; slaps remain available during the card-play animation because the
card is already on the pile. Reduced motion changes presentation while keeping
the same authoritative rules and timing. Exact animation durations and stale-slap
checks are listed in the [implementation notes](implementation.md).

## Implementation status

Checked items describe implemented game behavior. Manual multiplayer testing
and playtest findings are recorded separately.

### Game availability

- [x] Keep Egyptian War visible so players can read its rules and configure its settings.
- [x] Mark Egyptian War playable after its server-authoritative game loop and client interface are implemented.

### Existing configuration

- [x] Support 2–8 players in the game definition.
- [x] Define standard cards and optional Jokers.
- [x] Configure one, two, or three complete decks, defaulting to one; include two Jokers per deck when Jokers are enabled.
- [x] Configure Jokers, doubles, sandwiches, three in a row, top-bottom, adjacent-card tens, and marriage as lobby settings.
- [x] Apply the saved settings to server-side slap validation.
- [x] Configure the false-slap penalty to 1, 2, or 3 cards, defaulting to 2.
- [x] Configure a 5–120 second player timer with a default of 15 seconds using synchronized slider and number controls.
- [x] Reset the active player's timer after they win a valid slap on their own turn.

### Server-authoritative gameplay

- [x] Implement server-side deck creation and cryptographic shuffling.
- [x] Implement face-down dealing and public state without hidden decks.
- [x] Implement random first-player selection.
- [x] Initialize the engine when a live room starts Egyptian War.
- [x] Enforce clockwise turns.
- [x] Implement Jack, Queen, King, Ace, and Joker challenge attempts (Jokers allow 5 attempts).
- [x] Award the pile to the most recent challenge-card player when a challenge fails, except while a valid final-attempt slap window is active.
- [x] Validate slaps on the server and resolve competing slaps fairly.
- [x] Resolve competing slaps using server receipt times, with earlier attempts favored and no client-controlled timing advantage. See the [implementation notes](implementation.md#timing-and-verification-reference) for arbitration details.
- [x] Finish accepted slap arbitration before honoring a host pause, and allow candidates accepted before a disconnect-triggered pause to resolve instead of silently discarding them.
- [x] Skip players who run out of cards; continue the turn with the next eligible player.
- [x] Pass an unfinished challenge to the next eligible player with the remaining attempts unchanged when its responder runs out of cards.
- [x] Allow eliminated players to reenter through a valid slap.
- [x] Detect when one player owns every card and end the game.
- [x] Return the room to the lobby after the game ends.
- [x] Pause the active game when a player disconnects; allow the host to resume while the player is away, and restore the saved pause preference after they reconnect.
- [x] Gray out disconnected players' table seats and show a yellow disconnected alert beneath each seat.
- [x] Preserve a reconnecting active player's remaining turn time and allow one short grace period per turn, capped at the configured turn duration, then continue normal automatic turn play if the timer expires.
- [x] Send recent face-up cards in reconnect snapshots so the board restores the visible pile after reconnecting.
- [x] Reject slap actions when there are no face-up cards available to slap, including immediately after a pile transfer or reconnect.
- [x] Let the host kick a disconnected player during a game; hold their cards face-down until the current pile is awarded, then add them to the next pile.
- [x] Tell a kicked player they were removed after disconnecting if they later try to reconnect, and notify the table when their cards are deferred.
- [x] Play the game-winner animation when kicking opponents leaves the host as the last player.
- [x] Keep slap actions available throughout active play, including for players out of cards, while rejecting actions during pile-transfer, penalty, and win animations and during pauses. Slaps are still collected during the short card-play animation, because the card is already on the pile.
- [x] Penalize an invalid slap by moving the configured number of the player's cards to the bottom of the pile; forfeit any remaining cards if fewer than the configured penalty remain.
- [x] Keep face-down false-slap penalty cards out of slap-pattern validation so repeated penalties cannot manufacture a valid slap.
- [x] End the game when only one player has cards and the face-up pile offers no valid slap for an eliminated player to reenter.
- [x] Never let a challenger answer their own challenge: when nobody but the challenger can continue, the challenger wins the pile (or the slap window opens).
- [x] Prevent a player who false-slaps away their last card from retrying the unchanged pile while allowing one attempt on the next played card. When an already eliminated player false-slaps, make them skip two played cards and allow another attempt on the third.
- [x] Keep slap-pattern information off the wire: the public state carries a `pileVersion` but no slappable flag, and messages about a pending pile are neutral.
- [x] Have slaps carry the `pileVersion` the player last saw. A slap that lost a short race with a card play (previous version, previous pile slappable, under 350 ms) is ignored without a penalty.
- [x] Allow a player to leave voluntarily; their cards are held face-down and added to the next pile, just like a host removal. If removing a player leaves nobody holding cards, the remaining cards go to the next player in turn order immediately.
- [x] Allow only the host to pause and resume the game; enforce pause state on the server.
- [x] Preserve a final played card and winner state long enough for the win animation before returning to the lobby.
- [x] Enforce the player timer on the server and pause it during host pauses and action animations; add a short reconnect grace period, then auto-play on timeout.
- [x] When the final failed challenge card creates a valid slap, allow slaps for a short fixed window (four seconds, not a whole turn) before awarding the pile to the challenge owner.
- [x] Let the host end an active game and return everyone to the lobby after confirming in the browser.

### Client gameplay

- [x] Keep active gameplay fixed to the usable mobile viewport so browser chrome and the on-screen keyboard cannot push the board off-screen.
- [x] Reserve space for GameHub's compact Settings shortcut above the package-owned Pause and connection-latency row on narrow screens.
- [x] Render each player's public state without revealing hidden cards.
- [x] Render the central pile and the most recently played card.
- [x] Provide server-validated play-card and slap actions.
- [x] Show turn, challenge, elimination, pile-winner, and game-winner updates.
- [x] Replace the separate player list with a responsive table arena showing each player's avatar, name, and card count around the table.
- [x] Render physical-looking cards and animate played cards into the central pile.
- [x] Place play-card and slap controls immediately below the arena.
- [x] Display action and challenge messages on the table rather than below it.
- [x] Show late joiners in a dedicated in-game spectator list, including connection status and host removal controls.
- [x] Keep the in-game spectator list current as viewers join, leave, or reconnect.
- [x] Lay out each player avatar beside their name and card count, with an underline beneath the player details.
- [x] Highlight the entire current player's seat.
- [x] Animate cards moving from the pile into the pile winner's area and outline the winner in gold.
- [x] Animate one hand moving from the slapper's seat to the pile for valid and invalid slap attempts, including invalid reentry attempts by eliminated players; suppress extra hands while their cooldown is active.
- [x] Animate and retain the final played card while highlighting the game winner in gold.
- [x] Place a host-only pause/resume button at the upper-right of the gameplay panel.
- [x] Put a host-only Kick button beside a disconnected player's table alert.
- [x] Make the slap-rules list collapsible.
- [x] On narrow screens, place the collapsed rules Show control directly beside the Slap Rules label without changing the expanded panel or Hide control.
- [x] Show enabled slap patterns and the false-slap penalty in the upper-left of the gameplay panel.
- [x] Keep turn-state messages neutral; do not announce when the current pile matches a slap pattern.
- [x] Show the synchronized turn countdown below the table while reserving its layout space when hidden.
- [x] Keep the current whole seconds stationary at the right inside the timer track above its moving fill, align the timer to both action-button edges, and scale the complete control group together on narrow screens.
- [x] Decorate the countdown's uncovered track with a blue gradient and progressively revealed sleep marks, ending with a sleeping bear, without changing authoritative timer behavior.
- [x] Show each browser its latest display-only network round-trip time in the upper-right; never use that client-acknowledged measurement for slap arbitration.
- [x] Show connection status beside the gameplay controls.
- [x] Fit active gameplay into the browser viewport without page scrolling; overlay Chat, Spectators, and Scoreboard in the bottom-left panel; keep the timer and action buttons below the board; and show fixed-height, right-aligned turn text above the timer.
- [x] Let the side panel minimize into a chat bubble, switch between medium and large sizes, and remember layout state across games and reloads. Without a saved preference, phones start minimized and larger screens start at medium. The bubble shows unread messages from other players, capped at 9+.
- [x] Give the side-panel expand and minimize controls separate, lighter utility-button surfaces so they remain visually distinct from the Chat and Spectators tabs.
- [x] Keep Slap Rules at the upper-left and shrink the collapsed box around its title and adjacent Show control, restoring the full rules width when expanded.
- [x] Style "Play a Card" and "Slap" buttons as prominent game-action controls, with a secondary "Bring the pain" label and fire accents on Slap.
- [x] Keep slaps available during active play even when no pattern matches; disable them only when no face-up cards are present, the game is paused or finished, or a non-card-play animation is in progress.
- [x] Disable Play a Card for every player while a completed challenge is waiting through its final slap window, even though the next player remains identified in public state.
- [x] Restore active players from a complete reconnect snapshot.
- [x] Reuse the limited public game-state projection for spectators so they receive the visible pile, public player state, timers, and live animations without hidden decks.
- [x] Use game-specific background music and synchronize card, slap, pile-win, and game-win sounds with their corresponding presentation animations.

### Table presentation

- [x] Draw the table with CSS until a project-owned table image is available.
- [x] Give the CSS table layered felt, wooden rails, depth, and shadows, adapting between a tall rounded rectangle and the oval shape according to the available board aspect ratio.
- [x] Draw cards as accessible HTML/CSS playing-card faces; do not depend on external card image assets.
- [x] Render mirrored card corners, distinct face-card styling, and a Joker with vertical JOKER labels and a decorative center that is distinguishable from a Jack.
- [x] Render slap hands with the splayed-hand emoji on desktop and the backhand emoji on coarse-pointer/mobile devices, scale them and their stopping distance with the rendered card size, keep their shadows visually below the hand at every seat rotation, and layer later collected attempts above the official winner.
- [x] Keep the table, player seats, card motion, spectator area, and controls usable on narrow screens and with reduced-motion preferences.

## Playtest questions (optional)

Keep these questions focused on the intended experience. Detailed test
instructions, observations, and results belong in separate playtest notes.

- **Can new players follow challenges?** Players should understand who responds,
  how many attempts remain, and when the pile can still be slapped.
- **Do players stay involved after running out of cards?** Reentry should feel
  achievable, and false-slap cooldowns should be understandable.
- **Are slap results understandable?** Players should understand the outcome even
  when competing attempts arrive close together or network latency differs.
- **Does the pace work across configurations?** Player count, decks, and enabled
  rules should produce engaging play without excessive waits.
- **Can players recover from disconnects confidently?** Countdown, pause, and
  host-handoff behavior should match players' expectations.
- **Is the interface usable across devices?** The board, turn indicator, and
  controls should remain clear and accessible with keyboard or touch input.
- **Are room totals clear?** Players should understand what each statistic counts,
  when totals disappear, and what resetting them does.
