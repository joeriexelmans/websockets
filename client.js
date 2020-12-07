
// Client parameters

// If connection to server does not succeed within this amount of time, try again.
// const RECONNECT_INTERVAL = 2000; // ms

const PING_INTERVAL = 1000; // ms

// After not having received anything from the server for this amount of time, reconnect.
const SERVER_TIMEOUT = 4000; // ms


function recvJSON(data) {
  const parsed = JSON.parse(data) // may throw
  if (parsed.type !== "pong") console.log("--> ", parsed);
  return parsed;
}

class Client {

  constructor(addr) {
    this.addr = addr;

    this.eventHandlers = {
      connected: [],
      disconnected: [],
      receivePush: [],
      receiveReq: [],
    };

    this.socket = null;
    this.socket_number = -1;
    this.sockets = 0;

    this.requestReply = new RequestReply();

    // This timer is reset each time we send anything to the server.
    // upon timeout, we send a ping
    this.sendPingTimer = new Timer(PING_INTERVAL, () => {
      this.socket.sendJSON({ type: "ping" });
      this.sendPingTimer.set(); // schedule next ping
    });

    // this timer is reset each time we receive anything from the server.
    // upon timeout, connection is considered dead
    this.serverTimeoutTimer = new Timer(SERVER_TIMEOUT, () => {
      console.log("server timeout..")
      this.connect();
    });
  }

  on(event, handler) {
    this.eventHandlers[event].push(handler);
  }

  // (re)connects to server
  connect() {
    this.sendPingTimer.unset();

    if (this.socket !== null) {
      console.log("force disconnect socket ", this.socket_number)
      this.eventHandlers.disconnected.forEach(h => h());
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.close();
    }

    const socket = new WebSocket(this.addr);
    const socket_number = this.sockets++;
    console.log("new socket", socket_number)

    this.serverTimeoutTimer.set();

    socket.sendJSON = function(json) {
      if (json.type !== "ping") console.log("<-- ", json);
      this.send(JSON.stringify(json));
    }

    socket.onmessage = (event) => {
      let parsed;
      try {
        parsed = recvJSON(event.data);
      } catch (e) {
        return; // ignore unparsable messages
      }

      this.serverTimeoutTimer.set();

      if (parsed.type === "res") {
        this.requestReply.handleResponse(parsed);
      }
      else if (parsed.type === "push") {
        const {what, data} = parsed;
        this.eventHandlers.receivePush.forEach(h => h(what, data));
      }
      else if (parsed.type === "req") {
        const {id, what, data} = parsed;
        const reply = (err, data) => {
          socket.sendJSON({type:"res", id, err, data});
        }
        this.eventHandlers.receiveReq.forEach(h => h(what, data, reply));
      }
    }

    socket.onopen = () => {
      console.log("socket.onopen", socket_number)
      // Connected!
      socket.onclose = e => {
        console.log("socket.onclose", e, "socket_number", socket_number)
        this.eventHandlers.disconnected.forEach(h => h());
        this.sendPingTimer.unset();
        this.connect();
      }

      // resend pending requests
      this.requestReply.getPending().forEach(([req,]) => {
        socket.sendJSON(req);
      });

      this.sendPingTimer.set();
      this.serverTimeoutTimer.set();

      this.eventHandlers.connected.forEach(h => h(socket));
    }

    this.socket = socket;
    this.socket_number = socket_number;
  }

  request(what, data, callback) {
    const req = this.requestReply.createRequest(what, data, callback);
    this.socket.sendJSON(req);
    this.sendPingTimer.set();
  }
}

class PeerToPeer {
  constructor(client, handlers) {
    this.client = client;

    this.client.on('receiveReq', (what, data, reply) => {
      if (what === "msg") {
        const {from, msg} = data;
        if (handlers.hasOwnProperty(msg.what)) {
          handlers[msg.what](from, msg.data, reply);
        }
      }
    });
  }

  send(to, what, data, callback) {
    this.client.request("forw", { to, msg: { what, data } }, callback);
  }
}
