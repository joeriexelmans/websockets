const WebsocketServer = require('ws').Server;

// Server parameters

// After having not received anything from the client (including pings) for this amount of time,
// the client will be considered disconnected.
const CLIENT_TIMEOUT = 5000; // ms

class Server {

  constructor() {
    this.eventHandlers = {
      arrive: [],
      leave: [],
      receive: [],
      listening: [],
    };
  }

  on(eventName, callback) {
    this.eventHandlers[eventName].push(callback);
  }

  listen(port) {
    const server = new WebsocketServer({port});
    let nextConnId = 0;
    const connections = {};

    server.on('listening', () => {
      this.eventHandlers.listening.forEach(h => h(connections));
    })

    server.on('connection', (socket, req) => {
      const connId = nextConnId++;
      let timer = null;

      const resetTimer = () => {
        // TODO: evaluate if the use of NodeJS timers here is detrimental to performance
        // if we are dealing with many concurrent connections.
        // Alternatively switch to an event queue with heap data structure
        clearTimeout(timer);

        timer = setTimeout(() => {
          console.log("client", connId, "timeout");
          socket.close();
          if (connections.hasOwnProperty(connId)) {
            delete connections[connId];
            this.eventHandlers.leave.forEach(handler => handler(connId, connections));
          }
        }, CLIENT_TIMEOUT);      
      };

      socket.sendJSON = function(json) {
        console.log("<- ", json);
        this.send(JSON.stringify(json));
      }

      resetTimer();
      connections[connId] = socket;
      this.eventHandlers.arrive.forEach(handler => handler(connId, socket, connections));

      socket.on('open', () => {
        // Seems to never occur for incoming connections
        console.log("client", connId, "open");
      });

      socket.on('message', data => {
        resetTimer();
        // const sliced = data.length > 40 ? data.slice(0,40)+"..." : data;

        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          return; // ignore unparsable messages
        }
        if (parsed.type === "ping") {
          socket.sendJSON({ type: "pong" });
          return;
        }
        
        this.eventHandlers.receive.forEach(handler => handler(connId, socket, parsed));
      });

      socket.on('ping', data => {
        resetTimer();
        // Browsers can't send pings, but we send back pongs anyway, just in case
        socket.pong();
      });

      socket.on('close', (code, reason) => {
        // console.log("client", connId, "closed. code:", code, "reason:", reason);
        if (connections.hasOwnProperty(connId)) {
          clearTimeout(timer);
          delete connections[connId];
          this.eventHandlers.leave.forEach(handler => handler(connId, connections));
        }
      });
    });
  }
}

// Some example handlers:

// Logs arrive/leave events
function logArrivalDeparture(server) {
  server.on('arrive', (connId, socket, connections) => {
    console.log("client", connId, "arrive", "clients:", Object.keys(connections));
  })

  server.on('leave', (connId, connections) => {
    console.log("client", connId, "leave", "clients:", Object.keys(connections));
  })
}

// Broadcasts list of peers to everyone, whenever someone arrives or leaves
function notifyPeers(server) {
  function notify(connections) {
    peers = Object.keys(connections);
    Object.entries(connections).forEach(([connId, socket]) => {
      socket.sendJSON({
        type: "push",
        what: "peers",
        data: {peers, you: connId},
      });
    });
  }
  server.on('arrive', (connId, socket, connections) => {
    notify(connections);
  });

  server.on('leave', (connId, connections) => {
    notify(connections);
  });
}

// Install a custom set of request handlers
function installRequestResponseProtocol(server, handlers) {
  server.on('receive', (connId, socket, parsed) => {
    console.log("client", connId, "receiveReq", parsed);
    if (parsed.type === "req") {
      const {id, what, data} = parsed;
      if (!Number.isInteger(id)) {
        return; // invalid request
      }
      const reply = (err, data) => {
        socket.sendJSON({ type: "res", id, err, data });
      };
      if (handlers.hasOwnProperty(what)) {
        handlers[what](data, reply, connId);
      } else {
        //reply("invalid request: " + what)
      }
    }
  })
}

function messagingBroker(server) {
  let connections = null;
  server.on('listening', cs => {
    connections = cs;
  });

  const pending = {};
  let ctr = 0;

  server.on('receive', (connId, socket, parsed) => {
    if (parsed.type === "res") {
      const {id, err, data} = parsed;
      if (pending.hasOwnProperty(id)) {
        const reply = pending[id];
        reply(err, data);
        // forward reply
        // reply(null, {err, data});
      }
    }
  });

  installRequestResponseProtocol(server, {
    "forw": (data, reply, from) => {
      const {to, msg} = data;
      if (connections.hasOwnProperty(to)) {
        const toSocket = connections[to];
        const id = ctr++;
        pending[id] = reply;
        toSocket.sendJSON({ type: "req", id, what: "msg", data: { from, msg } });
        // reply();
      } else {
        reply("unknown 'to'");
      }
    }
  })
}


module.exports = {
  Server,
  logArrivalDeparture,
  notifyPeers,
  installRequestResponseProtocol,
  messagingBroker,
}

