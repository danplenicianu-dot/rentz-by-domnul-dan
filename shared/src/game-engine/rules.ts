import {
  RANKS,
  SEATS,
  SUITS,
  type Card,
  type GameState,
  type Rank,
  type RoundSummary,
  type Seat,
  type Subgame,
  type Suit,
  type TrickPlay
} from "../types/index.js";
import { beginRound, isGameOver, rotateChooser } from "./state.js";

const rankValue = (rank: Rank) => RANKS.indexOf(rank);
const nextSeat = (seat: Seat): Seat => (((seat + 1) % 4) as Seat);
const previousSeat = (seat: Seat): Seat => (((seat + 3) % 4) as Seat);
const trickSubgames: Subgame[] = ["carouri", "dame", "popa_rosu", "zece_trefla", "whist", "totale"];

function seatAfterSkip(seat: Seat, playedCard: Card): Seat {
  return playedCard.rank === "7" ? nextSeat(nextSeat(seat)) : nextSeat(seat);
}

function removeCard(hand: Card[], cardId: string): Card[] {
  return hand.filter((card) => card.id !== cardId);
}

export function getLegalMoves(state: GameState, seat: Seat): Card[] {
  const player = state.players[seat];
  if (state.phase !== "playing" || state.currentTurn !== seat || !state.currentSubgame) return [];
  if (trickSubgames.includes(state.currentSubgame)) {
    const ledSuit = state.trick?.ledSuit;
    if (!ledSuit) return player.hand;
    const follows = player.hand.filter((card) => card.suit === ledSuit);
    return follows.length > 0 ? follows : player.hand;
  }
  return getLegalRentzMoves(state, seat);
}

export function validateMove(state: GameState, seat: Seat, cardId: string): { ok: true; card: Card } | { ok: false; reason: string } {
  if (state.phase !== "playing") return { ok: false, reason: "Round is not currently playing." };
  if (state.currentTurn !== seat) return { ok: false, reason: "It is not your turn." };
  const card = state.players[seat].hand.find((candidate) => candidate.id === cardId);
  if (!card) return { ok: false, reason: "Card is not in your hand." };
  if (!getLegalMoves(state, seat).some((legal) => legal.id === cardId)) return { ok: false, reason: "That card is not legal now." };
  if (state.trick?.plays.some((play) => play.card.id === cardId)) return { ok: false, reason: "Card was already played." };
  return { ok: true, card };
}

export function applyMove(state: GameState, seat: Seat, cardId: string): GameState {
  const validation = validateMove(state, seat, cardId);
  if (!validation.ok) throw new Error(validation.reason);
  return state.currentSubgame === "rentz" ? applyRentzMove(state, seat, validation.card) : applyTrickMove(state, seat, validation.card);
}

function applyTrickMove(state: GameState, seat: Seat, card: Card): GameState {
  if (!state.trick || !state.currentSubgame) throw new Error("Missing trick state.");
  const plays = [...state.trick.plays, { seat, card }];
  const players = state.players.map((player) => (player.seat === seat ? { ...player, hand: removeCard(player.hand, card.id) } : player));
  const ledSuit = state.trick.ledSuit ?? card.suit;
  const next = nextSeat(seat);
  const updated: GameState = {
    ...state,
    players,
    currentTurn: next,
    trick: { ...state.trick, plays, ledSuit, currentTurn: next }
  };

  if (plays.length < 4) return updated;
  const resolved = resolveTrick(updated, plays, ledSuit);
  const shouldEnd = shouldEndTrickRound(resolved);
  return shouldEnd ? finishRound(resolved, true) : beginNextTrick(resolved);
}

function beginNextTrick(state: GameState): GameState {
  if (!state.trick) return state;
  const leader = state.trick.leader;
  return {
    ...state,
    currentTurn: leader,
    trick: { ...state.trick, currentTurn: leader, ledSuit: undefined, plays: [] }
  };
}

export function resolveTrick(state: GameState, plays: TrickPlay[] = state.trick?.plays ?? [], ledSuit: Suit = state.trick?.ledSuit ?? plays[0]?.card.suit): GameState {
  if (!state.trick || plays.length !== 4 || !ledSuit) throw new Error("A complete trick is required.");
  const winnerPlay = plays
    .filter((play) => play.card.suit === ledSuit)
    .sort((a, b) => rankValue(b.card.rank) - rankValue(a.card.rank))[0];
  const captured = { ...state.trick.captured, [winnerPlay.seat]: [...state.trick.captured[winnerPlay.seat], ...plays.map((play) => play.card)] };
  const tricksWon = { ...state.trick.tricksWon, [winnerPlay.seat]: state.trick.tricksWon[winnerPlay.seat] + 1 };
  return {
    ...state,
    currentTurn: winnerPlay.seat,
    trick: { ...state.trick, leader: winnerPlay.seat, currentTurn: winnerPlay.seat, captured, tricksWon }
  };
}

function shouldEndTrickRound(state: GameState): boolean {
  if (!state.currentSubgame || !state.trick) return false;
  if (state.currentSubgame === "popa_rosu") return Object.values(state.trick.captured).flat().some((card) => card.id === "K-hearts");
  if (state.currentSubgame === "zece_trefla") return Object.values(state.trick.captured).flat().some((card) => card.id === "10-clubs");
  return state.players.every((player) => player.hand.length === 0);
}

export function scoreRound(state: GameState): Record<Seat, number> {
  if (!state.currentSubgame) throw new Error("No subgame selected.");
  if (state.currentSubgame === "rentz") {
    const deltas = { 0: 100, 1: 100, 2: 100, 3: 100 } as Record<Seat, number>;
    state.players.forEach((player) => {
      if (player.finishedOrder) deltas[player.seat] = 500 - player.finishedOrder * 100;
    });
    return deltas;
  }
  const deltas = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<Seat, number>;
  if (!state.trick) return deltas;
  SEATS.forEach((seat) => {
    const captured = state.trick?.captured[seat] ?? [];
    if (state.currentSubgame === "carouri") deltas[seat] = captured.filter((card) => card.suit === "diamonds").length * -20;
    if (state.currentSubgame === "dame") deltas[seat] = captured.filter((card) => card.rank === "Q").length * -30;
    if (state.currentSubgame === "popa_rosu") deltas[seat] = captured.some((card) => card.id === "K-hearts") ? -100 : 0;
    if (state.currentSubgame === "zece_trefla") deltas[seat] = captured.some((card) => card.id === "10-clubs") ? 100 : 0;
    if (state.currentSubgame === "whist") deltas[seat] = (state.trick?.tricksWon[seat] ?? 0) * 20;
    if (state.currentSubgame === "totale") {
      deltas[seat] =
        (state.trick?.tricksWon[seat] ?? 0) * -10 +
        captured.filter((card) => card.suit === "diamonds").length * -20 +
        captured.filter((card) => card.rank === "Q").length * -30 +
        (captured.some((card) => card.id === "K-hearts") ? -100 : 0);
    }
  });
  return deltas;
}

export function finishRound(state: GameState, completed: boolean): GameState {
  if (!state.currentSubgame) throw new Error("No round to finish.");
  const deltas = scoreRound(state);
  const players = state.players.map((player) => ({
    ...player,
    score: player.score + deltas[player.seat],
    chosenSubgames:
      completed && player.seat === state.chooser && !player.chosenSubgames.includes(state.currentSubgame!)
        ? [...player.chosenSubgames, state.currentSubgame!]
        : player.chosenSubgames
  }));
  const totals = Object.fromEntries(players.map((player) => [player.seat, player.score])) as Record<Seat, number>;
  const summary: RoundSummary = { subgame: state.currentSubgame, chooser: state.chooser, deltas, totals, completed };
  return { ...state, phase: "round_summary", players, roundSummary: summary, currentTurn: undefined };
}

export function continueAfterRound(state: GameState): GameState {
  const roundNumber = state.roundNumber + (state.roundSummary?.completed ? 1 : 0);
  const chooser = state.roundSummary?.completed ? rotateChooser(state) : state.chooser;
  const nextState = { ...state, roundNumber, chooser, currentSubgame: undefined, trick: undefined, rentzBoard: undefined, roundSummary: undefined };
  if (isGameOver(nextState)) {
    return {
      ...nextState,
      phase: "game_over",
      gameOver: { ranking: [...nextState.players].sort((a, b) => b.score - a.score).map(({ seat, name, score }) => ({ seat, name, score })) }
    };
  }
  return { ...nextState, phase: "choosing_subgame" };
}

export function getLegalRentzMoves(state: GameState, seat: Seat): Card[] {
  const board = state.rentzBoard;
  if (!board) return [];
  return state.players[seat].hand.filter((card) => {
    const row = board[card.suit];
    if (row.cards.length === 0) return card.rank === "10";
    return rankValue(card.rank) === rankValue(row.low!) - 1 || rankValue(card.rank) === rankValue(row.high!) + 1;
  });
}

function applyRentzMove(state: GameState, seat: Seat, card: Card): GameState {
  if (!state.rentzBoard) throw new Error("Missing Rentz board.");
  const row = state.rentzBoard[card.suit];
  const cards = [...row.cards, card].sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  const low = cards[0].rank;
  const high = cards[cards.length - 1].rank;
  const players = state.players.map((player) => {
    if (player.seat !== seat) return player;
    const hand = removeCard(player.hand, card.id);
    const outCount = state.players.filter((candidate) => candidate.finishedOrder).length;
    return { ...player, hand, finishedOrder: hand.length === 0 && !player.finishedOrder ? outCount + 1 : player.finishedOrder };
  });
  let currentTurn = card.rank === "A" && players[seat].hand.length > 0 ? seat : seatAfterSkip(seat, card);
  const updated: GameState = {
    ...state,
    players,
    currentTurn,
    rentzBoard: { ...state.rentzBoard, [card.suit]: { ...row, cards, low, high } }
  };
  if (players.every((player) => player.hand.length === 0)) return finishRound(updated, true);
  return advancePastBlockedRentzPlayers(updated);
}

export function applyPass(state: GameState, seat: Seat): GameState {
  if (state.currentSubgame !== "rentz") throw new Error("Pass is only valid in Rentz.");
  if (state.currentTurn !== seat) throw new Error("It is not your turn.");
  if (getLegalRentzMoves(state, seat).length > 0) throw new Error("You must play a legal Rentz card.");
  return advancePastBlockedRentzPlayers({ ...state, currentTurn: nextSeat(seat) });
}

export function advancePastBlockedRentzPlayers(state: GameState): GameState {
  let current = state.currentTurn!;
  let guard = 0;
  while (guard < 4 && state.players[current].hand.length > 0 && getLegalRentzMoves({ ...state, currentTurn: current }, current).length === 0) {
    current = nextSeat(current);
    guard += 1;
  }
  return { ...state, currentTurn: current };
}

export function canRefuseRentz(state: GameState, seat: Seat): boolean {
  if (state.currentSubgame !== "rentz" || state.phase !== "playing") return false;
  const capete = state.players[seat].hand.filter((card) => card.rank === "A" || card.rank === "7").length;
  return capete >= 4;
}

export function refuseRentz(state: GameState, seat: Seat, random: () => number = Math.random): GameState {
  if (!canRefuseRentz(state, seat)) throw new Error("You cannot refuse Rentz with this hand.");
  return beginRound({ ...state, phase: "choosing_subgame" }, "rentz", random);
}

export function chooseSubgame(state: GameState, subgame: Subgame, random: () => number = Math.random): GameState {
  if (state.phase !== "choosing_subgame") throw new Error("Subgame selection is not open.");
  if (state.players[state.chooser].chosenSubgames.includes(subgame)) throw new Error("This chooser already selected that subgame.");
  return beginRound(state, subgame, random);
}

export function previousPlayer(seat: Seat): Seat {
  return previousSeat(seat);
}
