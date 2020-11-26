
// Client parameters

// If connection to server does not succeed within this amount of time, try again.
const RECONNECT_INTERVAL = 1000; // ms

const PING_INTERVAL = 1000; // ms

// After not having received anything from the server for this amount of time, reconnect.
const SERVER_TIMEOUT = 5000; // ms


function recvJSON(data) {
  const parsed = JSON.parse(data) // may throw
  if (parsed.type !== "pong") console.log("--> ", parsed);
  return parsed;
}

class Client {

  constructor() {
    this.eventHandlers = {
      connected: [],
      disconnected: [],
      receivePush: [],
      receiveReq: [],
    };

    this.connected = false;
    this.socket = null;

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
      this.connect();
    });
  }

  on(event, handler) {
    this.eventHandlers[event].push(handler);
  }

  // (re)connects to server
  connect() {
    if (this.socket !== null) {
      this.socket.close();
    }
    const attempt = () => {
      const socket = new WebSocket("ws://localhost:8010");

      // in case connection fails, try again later
      const retry = setTimeout(() => { this.connect(); }, RECONNECT_INTERVAL);

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
        // Connected!

        clearTimeout(retry);

        socket.onclose = () => {
          this.eventHandlers.disconnected.forEach(h => h());
          this.sendPingTimer.unset();
          this.serverTimeoutTimer.unset();
          attempt();
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
    };
    attempt();
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
    client.request("forw", { to, msg: { what, data } }, callback);
  }
}
