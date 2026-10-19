import {
  gameHubGameApiVersion,
  type GameDefinition,
  type GamePluginManifest
} from "@masonf539/game-sdk";

export type CardSuit =
  | "clubs"
  | "diamonds"
  | "hearts"
  | "spades";

export type CardRank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "jack"
  | "queen"
  | "king"
  | "ace"
  | "joker";

export type Card = {
  id: string;
  suit: CardSuit | null;
  rank: CardRank;
};

// Optional display metadata also works with older SDK declarations.
const egyptianWarDisplayOptions = [
    { key: "cardStyle", label: "Card style", defaultValue: "classic", choices: [
      { value: "classic", label: "Classic", previewPath: "/games/egyptian-war/assets/display/card-classic.svg" },
      { value: "modern", label: "Modern", previewPath: "/games/egyptian-war/assets/display/card-modern.svg" },
      { value: "midnight", label: "Midnight", previewPath: "/games/egyptian-war/assets/display/card-midnight.svg" }
    ] },
    { key: "tableColor", label: "Table color", defaultValue: "green", choices: [
      { value: "green", label: "Emerald", previewPath: "/games/egyptian-war/assets/display/table-green.svg" },
      { value: "blue", label: "Ocean", previewPath: "/games/egyptian-war/assets/display/table-blue.svg" },
      { value: "burgundy", label: "Burgundy", previewPath: "/games/egyptian-war/assets/display/table-burgundy.svg" }
    ] }
  ];

export const egyptianWar: GameDefinition & { displayOptions: typeof egyptianWarDisplayOptions } = {
  id: "egyptian-war",
  name: "Egyptian War",
  description:
    "Play cards into a central pile, survive face-card challenges, and race to slap enabled patterns. False slaps carry penalties, including a two-card wait for eliminated players. The last player holding all the cards wins.",
  isPlayable: true,
  chatEnabled: true,

  minPlayers: 2,
  maxPlayers: 6,

  preview: {
    videoPath: "/games/egyptian-war/assets/game-previews/preview.mp4",
    posterPath: "/games/egyptian-war/assets/game-previews/poster.webp"
  },

  keybinds: [
    {
      id: "play-card",
      label: "Play a card",
      description: "Play the top card when it is your turn.",
      defaultKey: "KeyE"
    },
    {
      id: "slap",
      label: "Slap",
      description: "Attempt to slap the central pile.",
      defaultKey: "Space"
    }
  ],

  displayOptions: egyptianWarDisplayOptions,

  rules: [
    "The server shuffles the deck, deals every card face down, and randomly selects the first player.",
    "Players cannot view or shuffle their decks.",
    "Each player has the configured number of seconds to take their turn. If time expires, the server plays that player's top card automatically.",
    "On a turn, a player flips the top card of their deck onto the central pile.",
    "Play proceeds clockwise until someone plays a face card (Jack, Queen, or King), an Ace, or a Joker.",
    "The next player must respond with another face card, Ace, or Joker. A Jack allows 1 attempt, a Queen 2 attempts, a King 3 attempts, an Ace 4 attempts, and a Joker 5 attempts.",
    "If the challenged player reveals another face card, Ace, or Joker, the challenge passes to the next player with the new number of attempts.",
    "If the challenged player uses every attempt without revealing a face card, Ace, or Joker, the player who most recently played a challenge card wins the pile unless the final card creates a valid slap combination.",
    "When the final failed challenge card creates a valid slap combination, players get a short window of about four seconds to slap; if nobody slaps, the most recent challenge card player wins the pile.",
    "If the challenged player runs out of cards before completing their attempts, the next player with cards inherits the challenge with the remaining attempts.",
    "A player who runs out of cards is skipped until they reenter by winning a valid slap. They may try once on the next played card. If an eliminated player false-slaps, they skip the next two played cards and may try again on the third.",
    "A player who wins the pile places all of its cards at the bottom of their deck without shuffling and begins the next pile.",
    "When a valid slap combination appears, the first player to slap wins the central pile.",
    "Slapping without a valid combination forfeits the configured number of cards face down to the bottom of the pile, or all remaining cards if fewer remain. Penalty cards do not create slap combinations. A player with no cards forfeits no cards for a false slap, skips the next two played cards, and may try again on the third.",
    "When only one player still has cards, that player wins unless the current face-up pile has a valid slap that allows an eliminated player to reenter.",
    "If several players slap at nearly the same moment, the pile goes to one of them by weighted chance that favors the earlier slap. The others forfeit nothing.",
    "The winner is the player who collects every card."
  ],

  settings: [
    {
      key: "offlineAutoPlay",
      label: "Auto-play Offline Players",
      description: "Pause briefly for reconnection, then automatically play offline players' turns. They can rejoin and take control again.",
      defaultValue: true
    },
    {
      type: "number",
      control: "range",
      key: "offlineGraceSeconds",
      label: "Offline Waiting Time",
      description: "Seconds to wait before auto-play takes over when enabled. A manual host pause is preserved.",
      defaultValue: 60,
      min: 15,
      max: 300,
      step: 5,
      unit: "second"
    },
    {
      type: "number",
      key: "deckCount",
      label: "Number of Decks",
      description:
        "Choose whether the game uses one, two, or three complete decks of cards.",
      defaultValue: 1,
      options: [1, 2, 3],
      unit: "deck"
    },
    {
      key: "includeJokers",
      label: "Include Jokers",
      description:
        "Add two Jokers per deck. Playing a Joker starts a five-attempt challenge and makes the pile slappable.",
      defaultValue: true
    },
    {
      key: "allowDoubles",
      label: "Doubles",
      description:
        "Allow a slap when two consecutive cards have the same rank.",
      defaultValue: true
    },
    {
      key: "allowSandwiches",
      label: "Sandwiches",
      description:
        "Allow a slap when matching ranks have exactly one card between them.",
      defaultValue: true
    },
    {
      key: "allowThreeInARow",
      label: "Three in a Row",
      description:
        "Allow a slap when three cards form an ascending or descending sequence.",
      defaultValue: true
    },
    {
      key: "allowTopBottom",
      label: "Top Bottom",
      description:
        "Allow a slap when the newest card matches the first card in the pile.",
      defaultValue: false
    },
    {
      key: "allowTens",
      label: "Tens",
      description:
        "Allow a slap when the two most recent cards are adjacent number cards that total ten. An Ace counts as one.",
      defaultValue: false
    },
    {
      key: "allowMarriage",
      label: "Marriage",
      description:
        "Allow a slap when a King and Queen are played consecutively in either order.",
      defaultValue: false
    },
    {
      type: "number",
      key: "falseSlapPenaltyCards",
      label: "False Slap Penalty",
      description:
        "Cards forfeited to the bottom of the pile for an invalid slap. An eliminated player forfeits no cards, skips the next two played cards, and may slap again on the third.",
      defaultValue: 2,
      options: [1, 2, 3],
      unit: "card"
    },
    {
      type: "number",
      control: "range",
      key: "turnTimerSeconds",
      label: "Player Timer",
      description:
        "Seconds each player has to play a card before the server plays their top card automatically.",
      defaultValue: 15,
      min: 5,
      max: 120,
      step: 1,
      unit: "second"
    }
  ]
};

export const egyptianWarManifest: GamePluginManifest = {
  apiVersion: gameHubGameApiVersion,
  packageVersion: "1.0.1-beta.5",
  definition: egyptianWar,
  client: {
    delivery: "embedded",
    markupPath: "template.html",
    entryPaths: ["register.js", "client.js"],
    stylePaths: ["style.css"]
  }
};
