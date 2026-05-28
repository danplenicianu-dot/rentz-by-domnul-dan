import { describe, expect, it } from "vitest";
import {
  SUBGAMES,
  beginRound,
  canRefuseRentz,
  chooseSubgame,
  continueAfterRound,
  createDeck,
  createInitialGameState,
  dealCards,
  getLegalMoves,
  getLegalRentzMoves,
  isGameOver,
  resolveTrick,
  scoreRound,
  type Card,
  type GameState,
  type Seat
} from "../index.js";
import { applyMove, applyPass, finishRound, refuseRentz } from "../game-engine/rules.js";

const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit, id: `${rank}-${suit}` });
const rand = () => 0.42;

function baseState(): GameState {
  const state = createInitialGameState(["Dan", "Ana", "Mihai", "Ioana"], ["a", "b", "c", "d"]);
  return { ...state, phase: "choosing_subgame" };
}

function trickState(subgame: GameState["currentSubgame"] = "whist"): GameState {
  return {
    ...baseState(),
    phase: "playing",
    currentSubgame: subgame,
    currentTurn: 0,
    players: baseState().players.map((player) => ({ ...player, hand: [] })),
    trick: {
      leader: 0,
      currentTurn: 0,
      ledSuit: undefined,
      plays: [],
      captured: { 0: [], 1: [], 2: [], 3: [] },
      tricksWon: { 0: 0, 1: 0, 2: 0, 3: 0 }
    },
    deck: []
  };
}

describe("deck and deal", () => {
  it("deck has 32 unique cards", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map((card) => card.id)).size).toBe(32);
  });

  it("deal gives 4 hands of 8 unique cards", () => {
    const hands = dealCards(createDeck());
    expect(hands).toHaveLength(4);
    expect(hands.every((hand) => hand.length === 8)).toBe(true);
    expect(new Set(hands.flat().map((card) => card.id)).size).toBe(32);
  });
});

describe("trick rules", () => {
  it("must follow suit when possible", () => {
    const state = trickState();
    state.currentTurn = 1;
    state.trick!.ledSuit = "hearts";
    state.players[1].hand = [c("7", "clubs"), c("A", "hearts")];
    expect(getLegalMoves(state, 1).map((card) => card.id)).toEqual(["A-hearts"]);
  });

  it("calculates trick winner by highest led suit", () => {
    const state = trickState();
    state.trick!.ledSuit = "clubs";
    state.trick!.plays = [
      { seat: 0, card: c("10", "clubs") },
      { seat: 1, card: c("A", "hearts") },
      { seat: 2, card: c("K", "clubs") },
      { seat: 3, card: c("7", "clubs") }
    ];
    const resolved = resolveTrick(state);
    expect(resolved.trick!.leader).toBe(2);
    expect(resolved.trick!.captured[2]).toHaveLength(4);
  });
});

describe("scoring", () => {
  it("scores Carouri diamonds", () => {
    const state = trickState("carouri");
    state.trick!.captured[0] = [c("7", "diamonds"), c("Q", "diamonds"), c("A", "clubs")];
    expect(scoreRound(state)[0]).toBe(-40);
  });

  it("scores Dame queens", () => {
    const state = trickState("dame");
    state.trick!.captured[1] = [c("Q", "diamonds"), c("Q", "spades")];
    expect(scoreRound(state)[1]).toBe(-60);
  });

  it("scores Popa Rosu and can end immediately", () => {
    const state = trickState("popa_rosu");
    state.trick!.captured[2] = [c("K", "hearts")];
    expect(scoreRound(state)[2]).toBe(-100);
  });

  it("scores 10 de Trefla and can end immediately", () => {
    const state = trickState("zece_trefla");
    state.trick!.captured[3] = [c("10", "clubs")];
    expect(scoreRound(state)[3]).toBe(100);
  });

  it("scores Whist tricks", () => {
    const state = trickState("whist");
    state.trick!.tricksWon[0] = 3;
    expect(scoreRound(state)[0]).toBe(60);
  });

  it("scores Totale including Q diamonds and K hearts", () => {
    const state = trickState("totale");
    state.trick!.tricksWon[0] = 1;
    state.trick!.captured[0] = [c("Q", "diamonds"), c("K", "hearts")];
    expect(scoreRound(state)[0]).toBe(-160);
  });
});

describe("Rentz", () => {
  it("opens a row with 10", () => {
    const state = chooseSubgame(baseState(), "rentz", rand);
    state.players[0].hand = [c("10", "clubs"), c("J", "clubs")];
    state.currentTurn = 0;
    expect(getLegalRentzMoves(state, 0).map((card) => card.id)).toEqual(["10-clubs"]);
  });

  it("allows adjacent placement", () => {
    const state = chooseSubgame(baseState(), "rentz", rand);
    state.rentzBoard!.clubs = { suit: "clubs", cards: [c("10", "clubs")], low: "10", high: "10" };
    state.players[0].hand = [c("9", "clubs"), c("Q", "clubs")];
    state.currentTurn = 0;
    expect(getLegalRentzMoves(state, 0).map((card) => card.id)).toEqual(["9-clubs"]);
  });

  it("auto-passes blocked players", () => {
    const state = chooseSubgame(baseState(), "rentz", rand);
    state.rentzBoard!.clubs = { suit: "clubs", cards: [c("10", "clubs")], low: "10", high: "10" };
    state.players[0].hand = [c("9", "clubs")];
    state.players[1].hand = [c("A", "spades")];
    state.players[2].hand = [c("J", "clubs")];
    state.currentTurn = 1;
    const next = applyPass(state, 1);
    expect(next.currentTurn).toBe(2);
  });

  it("Ace gives an extra move", () => {
    const state = chooseSubgame(baseState(), "rentz", rand);
    state.rentzBoard!.clubs = { suit: "clubs", cards: [c("10", "clubs"), c("J", "clubs"), c("Q", "clubs"), c("K", "clubs")], low: "10", high: "K" };
    state.players[0].hand = [c("A", "clubs"), c("10", "hearts")];
    state.currentTurn = 0;
    const next = applyMove(state, 0, "A-clubs");
    expect(next.currentTurn).toBe(0);
  });

  it("7 skips the next player once", () => {
    const state = chooseSubgame(baseState(), "rentz", rand);
    state.rentzBoard!.clubs = { suit: "clubs", cards: [c("8", "clubs"), c("9", "clubs"), c("10", "clubs")], low: "8", high: "10" };
    state.players[0].hand = [c("7", "clubs"), c("10", "hearts")];
    state.players[2].hand = [c("10", "diamonds")];
    state.currentTurn = 0;
    const next = applyMove(state, 0, "7-clubs");
    expect(next.currentTurn).toBe(2);
  });

  it("checks refusal condition", () => {
    const state = chooseSubgame(baseState(), "rentz", rand);
    state.players[1].hand = [c("A", "clubs"), c("A", "spades"), c("7", "clubs"), c("7", "diamonds")];
    expect(canRefuseRentz(state, 1)).toBe(true);
    expect(refuseRentz(state, 1, rand).chooser).toBe(state.chooser);
  });
});

describe("round flow", () => {
  it("rotates chooser after completed round", () => {
    const state = finishRound(trickState("whist"), true);
    expect(continueAfterRound(state).chooser).toBe(1);
  });

  it("disables already chosen subgames", () => {
    const state = finishRound({ ...trickState("whist"), chooser: 0 }, true);
    const next = continueAfterRound(state);
    const backToSouth: GameState = { ...next, chooser: 0 };
    expect(() => chooseSubgame(backToSouth, "whist", rand)).toThrow(/already selected/);
  });

  it("ends after 28 completed subgame rounds", () => {
    let state = baseState();
    for (let round = 0; round < 28; round += 1) {
      const chooser = (round % 4) as Seat;
      const subgame = SUBGAMES[Math.floor(round / 4)];
      state = { ...state, chooser, phase: "playing", currentSubgame: subgame, trick: trickState(subgame === "rentz" ? "whist" : subgame).trick };
      state = finishRound(state, true);
      state = continueAfterRound(state);
    }
    expect(isGameOver(state)).toBe(true);
    expect(state.phase).toBe("game_over");
  });
});
