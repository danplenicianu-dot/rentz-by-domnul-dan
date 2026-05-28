import {
  SEATS,
  SUBGAMES,
  SUITS,
  type GameState,
  type PrivatePlayerState,
  type RentzBoardRow,
  type Seat,
  type Subgame
} from "../types/index.js";
import { createDeck, dealCards, shuffleDeck } from "./deck.js";
import { getLegalMoves } from "./rules.js";

const emptySeatMap = <T>(value: T): Record<Seat, T> => ({ 0: value, 1: value, 2: value, 3: value });

export function createInitialGameState(names: string[], tokens: string[]): GameState {
  return {
    phase: "lobby",
    hostSeat: 0,
    chooser: 0,
    dealerNonce: 0,
    roundNumber: 0,
    deck: [],
    players: SEATS.map((seat) => ({
      seat,
      name: names[seat] ?? `Player ${seat + 1}`,
      token: tokens[seat] ?? "",
      connected: Boolean(names[seat]),
      score: 0,
      chosenSubgames: [],
      hand: []
    }))
  };
}

export function rotateChooser(state: GameState): Seat {
  return (((state.chooser + 1) % 4) as Seat);
}

export function isGameOver(state: GameState): boolean {
  return state.roundNumber >= 28 || state.players.every((player) => player.chosenSubgames.length === SUBGAMES.length);
}

export function availableSubgamesForChooser(state: GameState): Subgame[] {
  const chosen = new Set(state.players[state.chooser].chosenSubgames);
  return SUBGAMES.filter((subgame) => !chosen.has(subgame));
}

export function beginRound(state: GameState, subgame: Subgame, random: () => number = Math.random): GameState {
  const deck = shuffleDeck(createDeck(), random);
  const hands = dealCards(deck);
  const rentzBoard = SUITS.reduce(
    (rows, suit) => ({ ...rows, [suit]: { suit, cards: [] } satisfies RentzBoardRow }),
    {} as Record<(typeof SUITS)[number], RentzBoardRow>
  );

  return {
    ...state,
    phase: "playing",
    currentSubgame: subgame,
    deck,
    dealerNonce: state.dealerNonce + 1,
    currentTurn: state.chooser,
    roundSummary: undefined,
    gameOver: undefined,
    rentzBoard: subgame === "rentz" ? rentzBoard : undefined,
    trick:
      subgame === "rentz"
        ? undefined
        : {
            leader: state.chooser,
            currentTurn: state.chooser,
            plays: [],
            captured: emptySeatMap([]).valueOf() as Record<Seat, never[]>,
            tricksWon: { 0: 0, 1: 0, 2: 0, 3: 0 }
          },
    players: state.players.map((player) => ({ ...player, hand: hands[player.seat], finishedOrder: undefined }))
  };
}

export function getPublicState(state: GameState) {
  return {
    phase: state.phase,
    hostSeat: state.hostSeat,
    chooser: state.chooser,
    roundNumber: state.roundNumber,
    currentSubgame: state.currentSubgame,
    currentTurn: state.currentTurn,
    players: state.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      connected: player.connected,
      score: player.score,
      handCount: player.hand.length,
      chosenSubgames: player.chosenSubgames,
      finishedOrder: player.finishedOrder
    })),
    trick: state.trick
      ? {
          leader: state.trick.leader,
          currentTurn: state.trick.currentTurn,
          ledSuit: state.trick.ledSuit,
          plays: state.trick.plays,
          tricksWon: state.trick.tricksWon
        }
      : undefined,
    rentzBoard: state.rentzBoard,
    roundSummary: state.roundSummary,
    gameOver: state.gameOver
  };
}

export function getPrivateStateForPlayer(state: GameState, seat: Seat): PrivatePlayerState {
  const publicState = getPublicState(state);
  return {
    selfSeat: seat,
    ...publicState,
    hand: state.players[seat].hand,
    legalCardIds: state.phase === "playing" && state.currentTurn === seat ? getLegalMoves(state, seat).map((card) => card.id) : []
  };
}
