import { createServer } from "node:http";
import { nanoid } from "nanoid";
import { WebSocketServer, type WebSocket } from "ws";
import {
  chooseSubgame,
  continueAfterRound,
  createInitialGameState,
  getPrivateStateForPlayer,
  applyMove,
  applyPass,
  refuseRentz,
  type ClientAction,
  type GameState,
  type Seat,
  type ServerMessage
} from "@rentz/shared";

interface Room {
  code: string;
  state: GameState;
  sockets: Map<Seat, WebSocket>;
  disconnectTimers: Map<Seat, NodeJS.Timeout>;
}

const PORT = Number(process.env.PORT ?? 8787);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const rooms = new Map<string, Room>();
const socketSeats = new WeakMap<WebSocket, { roomCode: string; seat: Seat }>();

function createRoomCode(): string {
  let code = "";
  do {
    code = nanoid(5).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  } while (rooms.has(code));
  return code;
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: "ERROR", message });
}

function broadcast(room: Room): void {
  room.sockets.forEach((socket, seat) => {
    send(socket, { type: "PRIVATE_PLAYER_STATE", roomCode: room.code, state: getPrivateStateForPlayer(room.state, seat) });
  });
}

function attachSocket(room: Room, seat: Seat, ws: WebSocket): void {
  const previous = room.sockets.get(seat);
  if (previous && previous.readyState === previous.OPEN) previous.close(1000, "Reconnected elsewhere");
  const timer = room.disconnectTimers.get(seat);
  if (timer) clearTimeout(timer);
  room.disconnectTimers.delete(seat);
  room.sockets.set(seat, ws);
  socketSeats.set(ws, { roomCode: room.code, seat });
  room.state.players[seat].connected = true;
}

function findSeatByToken(room: Room, token: string): Seat | undefined {
  return room.state.players.find((player) => player.token === token)?.seat;
}

function joinRoom(room: Room, ws: WebSocket, name: string, token?: string): { seat: Seat; token: string } {
  if (token) {
    const reconnectSeat = findSeatByToken(room, token);
    if (reconnectSeat !== undefined) {
      room.state.players[reconnectSeat].name = name || room.state.players[reconnectSeat].name;
      attachSocket(room, reconnectSeat, ws);
      return { seat: reconnectSeat, token };
    }
  }
  const openSeat = room.state.players.find((player) => !player.token)?.seat;
  if (openSeat === undefined) throw new Error("Room is full.");
  const newToken = token || nanoid(24);
  room.state.players[openSeat] = { ...room.state.players[openSeat], name, token: newToken, connected: true };
  attachSocket(room, openSeat, ws);
  return { seat: openSeat, token: newToken };
}

function handleCreate(ws: WebSocket, action: Extract<ClientAction, { type: "CREATE_ROOM" }>) {
  const code = createRoomCode();
  const token = action.token || nanoid(24);
  const state = createInitialGameState([action.name], [token]);
  const room: Room = { code, state, sockets: new Map(), disconnectTimers: new Map() };
  rooms.set(code, room);
  attachSocket(room, 0, ws);
  send(ws, { type: "ROOM_STATE", roomCode: code, state: getPrivateStateForPlayer(room.state, 0), token });
}

function handleJoin(ws: WebSocket, action: Extract<ClientAction, { type: "JOIN_ROOM" }>) {
  const room = rooms.get(action.roomCode.toUpperCase());
  if (!room) throw new Error("Room not found.");
  const { seat, token } = joinRoom(room, ws, action.name, action.token);
  send(ws, { type: "ROOM_STATE", roomCode: room.code, state: getPrivateStateForPlayer(room.state, seat), token });
  broadcast(room);
}

function roomForSocket(ws: WebSocket): { room: Room; seat: Seat } {
  const ref = socketSeats.get(ws);
  if (!ref) throw new Error("Create or join a room first.");
  const room = rooms.get(ref.roomCode);
  if (!room) throw new Error("Room no longer exists.");
  return { room, seat: ref.seat };
}

function handleGameAction(ws: WebSocket, action: ClientAction): void {
  const { room, seat } = roomForSocket(ws);
  switch (action.type) {
    case "START_GAME": {
      if (seat !== room.state.hostSeat) throw new Error("Only the host can start.");
      if (!room.state.players.every((player) => player.connected && player.token)) throw new Error("All 4 players must be connected.");
      room.state = { ...room.state, phase: "choosing_subgame" };
      break;
    }
    case "CHOOSE_SUBGAME":
      if (seat !== room.state.chooser) throw new Error("Only the chooser can select the subgame.");
      room.state = chooseSubgame(room.state, action.subgame);
      break;
    case "PLAY_CARD":
      room.state = applyMove(room.state, seat, action.cardId);
      break;
    case "PASS":
      room.state = applyPass(room.state, seat);
      break;
    case "REFUSE_RENTZ":
      room.state = refuseRentz(room.state, seat);
      break;
    case "CONTINUE_AFTER_ROUND":
      if (room.state.phase !== "round_summary") throw new Error("There is no completed round to continue.");
      room.state = continueAfterRound(room.state);
      break;
    case "LEAVE_ROOM":
      ws.close(1000, "Left room");
      return;
    default:
      throw new Error("Unsupported action.");
  }
  broadcast(room);
  if (room.state.roundSummary) {
    room.sockets.forEach((socket) => send(socket, { type: "ROUND_SUMMARY", summary: room.state.roundSummary! }));
  }
  if (room.state.gameOver) {
    room.sockets.forEach((socket) => send(socket, { type: "GAME_OVER", ranking: room.state.gameOver!.ranking }));
  }
}

const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes(req.headers.origin ?? "") ? req.headers.origin! : allowedOrigins[0] ?? "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" }).end("Rentz by Domnul Dan WebSocket server");
});

const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: (info, done) => {
    const origin = info.origin;
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") return done(true);
    done(false, 403, "Origin not allowed");
  }
});

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    try {
      const action = JSON.parse(raw.toString()) as ClientAction;
      if (action.type === "CREATE_ROOM") handleCreate(ws, action);
      else if (action.type === "JOIN_ROOM") handleJoin(ws, action);
      else if (action.type === "RECONNECT") {
        const room = rooms.get(action.roomCode.toUpperCase());
        if (!room) throw new Error("Room not found.");
        const seat = findSeatByToken(room, action.token);
        if (seat === undefined) throw new Error("Reconnect token was not recognized.");
        attachSocket(room, seat, ws);
        send(ws, { type: "ROOM_STATE", roomCode: room.code, state: getPrivateStateForPlayer(room.state, seat), token: action.token });
        broadcast(room);
      } else {
        handleGameAction(ws, action);
      }
    } catch (error) {
      sendError(ws, error instanceof Error ? error.message : "Unexpected server error.");
    }
  });

  ws.on("close", () => {
    const ref = socketSeats.get(ws);
    if (!ref) return;
    const room = rooms.get(ref.roomCode);
    if (!room) return;
    room.sockets.delete(ref.seat);
    room.state.players[ref.seat].connected = false;
    const timer = setTimeout(() => {
      const latest = rooms.get(ref.roomCode);
      if (!latest) return;
      latest.disconnectTimers.delete(ref.seat);
      if (latest.sockets.size === 0) rooms.delete(ref.roomCode);
    }, 10 * 60 * 1000);
    room.disconnectTimers.set(ref.seat, timer);
    broadcast(room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Rentz by Domnul Dan server listening on ${PORT}`);
});
