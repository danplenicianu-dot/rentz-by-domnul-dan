export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank = "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type Seat = 0 | 1 | 2 | 3;
export type Phase =
  | "lobby"
  | "ready"
  | "dealing"
  | "choosing_subgame"
  | "playing"
  | "trick_resolution"
  | "round_summary"
  | "game_over";
export type Subgame = "carouri" | "dame" | "popa_rosu" | "zece_trefla" | "whist" | "rentz" | "totale";

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export interface Player {
  seat: Seat;
  name: string;
  connected: boolean;
  token: string;
  score: number;
  chosenSubgames: Subgame[];
  hand: Card[];
  finishedOrder?: number;
}

export interface TrickPlay {
  seat: Seat;
  card: Card;
}

export interface TrickState {
  leader: Seat;
  currentTurn: Seat;
  ledSuit?: Suit;
  plays: TrickPlay[];
  captured: Record<Seat, Card[]>;
  tricksWon: Record<Seat, number>;
}

export interface RentzBoardRow {
  suit: Suit;
  cards: Card[];
  low?: Rank;
  high?: Rank;
}

export interface RoundSummary {
  subgame: Subgame;
  chooser: Seat;
  deltas: Record<Seat, number>;
  totals: Record<Seat, number>;
  completed: boolean;
}

export interface GameState {
  phase: Phase;
  players: Player[];
  hostSeat: Seat;
  chooser: Seat;
  dealerNonce: number;
  roundNumber: number;
  currentSubgame?: Subgame;
  deck: Card[];
  trick?: TrickState;
  rentzBoard?: Record<Suit, RentzBoardRow>;
  currentTurn?: Seat;
  roundSummary?: RoundSummary;
  gameOver?: {
    ranking: Array<{ seat: Seat; name: string; score: number }>;
  };
}

export interface PublicPlayerState {
  seat: Seat;
  name: string;
  connected: boolean;
  score: number;
  handCount: number;
  chosenSubgames: Subgame[];
  finishedOrder?: number;
}

export interface PrivatePlayerState {
  selfSeat: Seat;
  phase: Phase;
  hostSeat: Seat;
  chooser: Seat;
  roundNumber: number;
  currentSubgame?: Subgame;
  currentTurn?: Seat;
  players: PublicPlayerState[];
  hand: Card[];
  legalCardIds: string[];
  trick?: Omit<TrickState, "captured">;
  rentzBoard?: Record<Suit, RentzBoardRow>;
  roundSummary?: RoundSummary;
  gameOver?: GameState["gameOver"];
}

export type ClientAction =
  | { type: "CREATE_ROOM"; name: string; token?: string }
  | { type: "JOIN_ROOM"; roomCode: string; name: string; token?: string }
  | { type: "LEAVE_ROOM" }
  | { type: "START_GAME" }
  | { type: "CHOOSE_SUBGAME"; subgame: Subgame }
  | { type: "PLAY_CARD"; cardId: string }
  | { type: "PASS" }
  | { type: "REFUSE_RENTZ" }
  | { type: "CONTINUE_AFTER_ROUND" }
  | { type: "RECONNECT"; roomCode: string; token: string };

export type ServerMessage =
  | { type: "ROOM_STATE"; roomCode: string; state: PrivatePlayerState; token?: string }
  | { type: "PRIVATE_PLAYER_STATE"; roomCode: string; state: PrivatePlayerState }
  | { type: "ERROR"; message: string }
  | { type: "ROUND_SUMMARY"; summary: RoundSummary }
  | { type: "GAME_OVER"; ranking: NonNullable<GameState["gameOver"]>["ranking"] };

export const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
export const RANKS: Rank[] = ["7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUBGAMES: Subgame[] = ["carouri", "dame", "popa_rosu", "zece_trefla", "whist", "rentz", "totale"];
export const SEATS: Seat[] = [0, 1, 2, 3];
