import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SUBGAMES, type Card, type ClientAction, type PrivatePlayerState, type ServerMessage, type Subgame } from "@rentz/shared";
import "./styles.css";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8787";
const subgameLabels: Record<Subgame, string> = {
  carouri: "Carouri",
  dame: "Dame",
  popa_rosu: "Popa Rosu",
  zece_trefla: "10 Trefla",
  whist: "Whist",
  rentz: "Rentz",
  totale: "Totale"
};
const suitSymbols: Record<Card["suit"], string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const suitOrder: Card["suit"][] = ["clubs", "diamonds", "hearts", "spades"];
const seatNames = ["South", "West", "North", "East"];

const activeToken = () => sessionStorage.getItem("rentz.activeToken") ?? undefined;
const rememberToken = (code: string, token: string) => {
  sessionStorage.setItem("rentz.activeToken", token);
  sessionStorage.setItem("rentz.activeRoom", code);
  localStorage.setItem(`rentz.token.${code}`, token);
};

function App() {
  const [state, setState] = useState<PrivatePlayerState | null>(null);
  const [roomCode, setRoomCode] = useState(localStorage.getItem("rentz.room") ?? "");
  const [name, setName] = useState(localStorage.getItem("rentz.name") ?? "");
  const [status, setStatus] = useState("Not connected");
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);

  const send = (action: ClientAction) => {
    if (!socket.current || socket.current.readyState !== WebSocket.OPEN) {
      setError("Connection is not open yet.");
      return;
    }
    socket.current.send(JSON.stringify(action));
  };

  const connect = () => {
    socket.current?.close();
    const ws = new WebSocket(WS_URL);
    socket.current = ws;
    ws.onopen = () => {
      setStatus("Connected");
      const token = sessionStorage.getItem("rentz.activeToken");
      const savedRoom = sessionStorage.getItem("rentz.activeRoom");
      if (token && savedRoom && !state) {
        ws.send(JSON.stringify({ type: "RECONNECT", roomCode: savedRoom, token } satisfies ClientAction));
      }
    };
    ws.onclose = () => setStatus("Disconnected");
    ws.onerror = () => setError("WebSocket connection failed.");
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "ERROR") setError(message.message);
      if (message.type === "ROOM_STATE" || message.type === "PRIVATE_PLAYER_STATE") {
        setError("");
        setRoomCode(message.roomCode);
        setState(message.state);
        localStorage.setItem("rentz.room", message.roomCode);
        if (message.type === "ROOM_STATE" && message.token) rememberToken(message.roomCode, message.token);
      }
    };
  };

  useEffect(() => {
    connect();
    return () => socket.current?.close();
  }, []);

  const createRoom = () => {
    localStorage.setItem("rentz.name", name || "Domnul Dan");
    send({ type: "CREATE_ROOM", name: name || "Domnul Dan", token: activeToken() });
  };

  const joinRoom = () => {
    localStorage.setItem("rentz.name", name || "Guest");
    send({ type: "JOIN_ROOM", roomCode, name: name || "Guest", token: activeToken() });
  };

  return (
    <main className="app">
      <header className="brand">
        <div>
          <p className="eyebrow">Premium multiplayer card table</p>
          <h1>Rentz by Domnul Dan</h1>
        </div>
        <div className="connection">
          <span className={status === "Connected" ? "dot online" : "dot"} />
          {status}
        </div>
      </header>

      {!state ? (
        <section className="lobby-shell">
          <div className="lobby-panel">
            <h2>Enter the table</h2>
            <label>
              Player name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Domnul Dan" />
            </label>
            <label>
              Room code
              <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ABCDE" />
            </label>
            <div className="actions">
              <button onClick={createRoom}>Create Room</button>
              <button className="secondary" onClick={joinRoom}>Join Room</button>
            </div>
            {error && <p className="error">{error}</p>}
          </div>
        </section>
      ) : (
        <GameTable
          state={state}
          roomCode={roomCode}
          error={error}
          send={send}
          resetLocal={() => {
            localStorage.removeItem("rentz.token");
            localStorage.removeItem("rentz.room");
            sessionStorage.removeItem("rentz.activeToken");
            sessionStorage.removeItem("rentz.activeRoom");
            setState(null);
            setRoomCode("");
            connect();
          }}
        />
      )}
    </main>
  );
}

function GameTable({ state, roomCode, error, send, resetLocal }: { state: PrivatePlayerState; roomCode: string; error: string; send: (action: ClientAction) => void; resetLocal: () => void }) {
  const self = state.players.find((player) => player.seat === state.selfSeat)!;
  const isHost = state.selfSeat === state.hostSeat;
  const isChooser = state.selfSeat === state.chooser;
  const allHere = state.players.every((player) => player.connected);
  const legal = new Set(state.legalCardIds);
  const orderedSeats = useMemo(() => {
    const seats = [0, 1, 2, 3] as const;
    return seats.map((seat) => ((seat - state.selfSeat + 4) % 4) as 0 | 1 | 2 | 3);
  }, [state.selfSeat]);

  return (
    <>
      <aside className="scoreboard">
        <div className="room-code">Room {roomCode}</div>
        <h2>Clasament</h2>
        {state.players.map((player) => (
          <div className={`score-row ${player.seat === state.currentTurn ? "active" : ""}`} key={player.seat}>
            <span>{seatNames[player.seat]} · {player.name}</span>
            <strong>{player.score}</strong>
          </div>
        ))}
        <button className="quiet" onClick={resetLocal}>Leave local seat</button>
      </aside>

      <section className="table-wrap">
        {state.phase === "lobby" && (
          <div className="waiting">
            <h2>Waiting for four players</h2>
            <p>{state.players.filter((player) => player.connected).length}/4 seats filled</p>
            <button disabled={!isHost || !allHere} onClick={() => send({ type: "START_GAME" })}>Start Game</button>
          </div>
        )}

        {state.phase === "choosing_subgame" && (
          <div className="chooser-panel">
            <h2>{isChooser ? "Choose subgame" : `${state.players[state.chooser].name} chooses`}</h2>
            <div className="subgame-grid">
              {SUBGAMES.map((subgame) => {
                const disabled = !isChooser || self.chosenSubgames.includes(subgame);
                return (
                  <button key={subgame} disabled={disabled} onClick={() => send({ type: "CHOOSE_SUBGAME", subgame })}>
                    {subgameLabels[subgame]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="table">
          <PlayerSpot position="south" player={state.players[state.selfSeat]} isTurn={state.currentTurn === state.selfSeat} />
          <PlayerSpot position="west" player={state.players[(state.selfSeat + 1) % 4]} isTurn={state.currentTurn === ((state.selfSeat + 1) % 4)} />
          <PlayerSpot position="north" player={state.players[(state.selfSeat + 2) % 4]} isTurn={state.currentTurn === ((state.selfSeat + 2) % 4)} />
          <PlayerSpot position="east" player={state.players[(state.selfSeat + 3) % 4]} isTurn={state.currentTurn === ((state.selfSeat + 3) % 4)} />

          <div className="center-play">
            <p>{state.currentSubgame ? subgameLabels[state.currentSubgame] : "Lobby"}</p>
            {state.currentSubgame === "rentz" && state.rentzBoard ? <RentzBoard state={state} /> : <TrickCenter state={state} />}
            {state.currentSubgame === "rentz" && state.currentTurn === state.selfSeat && state.legalCardIds.length === 0 && (
              <button className="pass" onClick={() => send({ type: "PASS" })}>Pass</button>
            )}
            {state.currentSubgame === "rentz" && state.phase === "playing" && (
              <button className="quiet" onClick={() => send({ type: "REFUSE_RENTZ" })}>Refuse Rentz</button>
            )}
          </div>
        </div>

        <Hand hand={state.hand} legal={legal} canPlay={state.currentTurn === state.selfSeat && state.phase === "playing"} onPlay={(cardId) => send({ type: "PLAY_CARD", cardId })} />
      </section>

      {state.roundSummary && (
        <div className="overlay">
          <div className="summary">
            <h2>Round Summary</h2>
            <p>{subgameLabels[state.roundSummary.subgame]}</p>
            {state.players.map((player) => (
              <div className="summary-row" key={player.seat}>
                <span>{player.name}</span>
                <span>{state.roundSummary!.deltas[player.seat] > 0 ? "+" : ""}{state.roundSummary!.deltas[player.seat]}</span>
                <strong>{state.roundSummary!.totals[player.seat]}</strong>
              </div>
            ))}
            <button onClick={() => send({ type: "CONTINUE_AFTER_ROUND" })}>Continue</button>
          </div>
        </div>
      )}

      {state.gameOver && (
        <div className="overlay">
          <div className="summary">
            <h2>Final Ranking</h2>
            {state.gameOver.ranking.map((player, index) => (
              <div className="summary-row" key={player.seat}>
                <span>{index + 1}. {player.name}</span>
                <strong>{player.score}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}

function PlayerSpot({ player, position, isTurn }: { player: PrivatePlayerState["players"][number]; position: string; isTurn: boolean }) {
  return (
    <div className={`player ${position} ${isTurn ? "turn" : ""}`}>
      <div>
        <strong>{player.name}</strong>
        <span>{player.connected ? "connected" : "reserved"}</span>
      </div>
      {position !== "south" && <div className="backs">{Array.from({ length: Math.min(player.handCount, 8) }).map((_, index) => <i key={index} />)}</div>}
    </div>
  );
}

function TrickCenter({ state }: { state: PrivatePlayerState }) {
  return (
    <div className="trick-grid">
      {state.trick?.plays.map((play) => (
        <div className="played-card" key={`${play.seat}-${play.card.id}`}>
          <CardView card={play.card} />
          <span>{seatNames[play.seat]}</span>
        </div>
      ))}
    </div>
  );
}

function RentzBoard({ state }: { state: PrivatePlayerState }) {
  return (
    <div className="rentz-board">
      {suitOrder.map((suit) => (
        <div className="rentz-row" key={suit}>
          <b>{suitSymbols[suit]}</b>
          <div>
            {state.rentzBoard![suit].cards.map((card) => <CardView key={card.id} card={card} small />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Hand({ hand, legal, canPlay, onPlay }: { hand: Card[]; legal: Set<string>; canPlay: boolean; onPlay: (cardId: string) => void }) {
  return (
    <div className="hand">
      {suitOrder.map((suit) => (
        <div className="suit-group" key={suit}>
          {hand.filter((card) => card.suit === suit).map((card) => {
            const playable = canPlay && legal.has(card.id);
            return (
              <button className={`hand-card ${playable ? "legal" : ""} ${canPlay && !legal.has(card.id) ? "illegal" : ""}`} key={card.id} disabled={!playable} onClick={() => onPlay(card.id)}>
                <CardView card={card} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CardView({ card, small = false }: { card: Card; small?: boolean }) {
  const red = card.suit === "diamonds" || card.suit === "hearts";
  return (
    <span className={`card ${red ? "red" : "black"} ${small ? "small-card" : ""}`}>
      <b>{card.rank}</b>
      <i>{suitSymbols[card.suit]}</i>
    </span>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
