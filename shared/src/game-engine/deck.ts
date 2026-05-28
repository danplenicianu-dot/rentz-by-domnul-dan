import { RANKS, SUITS, type Card } from "../types/index.js";

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank, id: `${rank}-${suit}` })));
}

export function shuffleDeck(deck: Card[], random: () => number = Math.random): Card[] {
  const shuffled = [...deck];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function dealCards(deck: Card[]): Card[][] {
  if (deck.length !== 32) {
    throw new Error("Rentz requires a 32-card deck.");
  }
  return [0, 1, 2, 3].map((seat) => deck.filter((_, index) => index % 4 === seat));
}
