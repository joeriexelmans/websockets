// Client parameters

// If connection to server does not succeed within this amount of time, try again.
const RECONNECT_INTERVAL = 1000; // ms

const PING_INTERVAL = 1000; // ms

// After not having received anything from the server for this amount of time, reconnect.
const SERVER_TIMEOUT = 5000; // ms


class Timer {
  constructor(duration, callback) {
    this.duration = duration;
    this.callback = callback;
    this.id = null;
  }

  // (re)sets timer
  set() {
    clearTimeout(this.id);
    this.id = setTimeout(() => {
      this.callback();
    }, this.duration);
  }

  unset() {
    clearTimeout(this.id);
  }
}

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
    this.pendingRequests = {};
    this.requestCtr = 0;

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
          const {id, err, data} = parsed;
          if (this.pendingRequests.hasOwnProperty(id)) {
            const [,, callback] = this.pendingRequests[id];
            delete this.pendingRequests[id];
            if (callback) {
              callback(err, data);
            }
          }
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
        Object.entries(this.pendingRequests).forEach(([id, [what, data]]) => {
          socket.sendJSON({ type: "req", id: parseInt(id), what, data });
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
    const id = this.requestCtr++;

    // store not just the response callback, but also the request itself, in case we have to resend it
    this.pendingRequests[id] = [what, data, callback];

    // attempt to send - has no effect when socket is closed
    this.socket.sendJSON({ type: "req", id, what, data });

    // postpone the next ping - the server knows we're alive from the request we just sent
    this.sendPingTimer.set();
  }
}


// function peerToPeer(client, handlers) {
//   client.on('receivePush', (what, data) => {
//     if (what === "msg") {
//       const {from, type, msg: {what, param}} = data;
//       if (handlers.hasOwnProperty(what)) {
//         const reply = data => {
//           client.request("reply", )
//         }
//         handers[what](from, param, reply);
//       }
//     }
//   })

//   const sendToPeer = 
// }

function peerToPeer(client, handlers) {

  client.on('receiveReq', (what, data, reply) => {
    if (what === "msg") {
      const {from, msg} = data;
      if (handlers.hasOwnProperty(msg.what)) {
        handlers[msg.what](from, msg.data, reply);
      }
    }
  });

  const sendToPeer = (to, what, data, callback) => {
    client.request("forw", { to, msg: { what, data } }, callback);
  }

  return sendToPeer;
}

