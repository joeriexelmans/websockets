const WebsocketServer = require('ws').Server;
const { RequestReply, Timer } = require('./common');

// Server parameters

// After having not received anything from a client (including pings) for this amount of time,
// the client will be considered disconnected.
const CLIENT_TIMEOUT = 5000; // ms

function shortId(id) {
  return id.substring(0, 8);
}

function recvJSON(data, from) {
  const parsed = JSON.parse(data) // may throw
  if (parsed.type !== "ping") console.log(shortId(from), "--> ", parsed);
  return parsed;
}

class Server {

  constructor(options) {
    this.eventHandlers = {
      arrive: [],
      leave: [],
      receive: [],
      listening: [],
    };

    const server = new WebsocketServer(options);
    const connections = {};

    server.on('listening', () => {
      this.eventHandlers.listening.forEach(h => h(connections));
    })

    server.on('connection', (socket, req) => {
      const reqUrl = new URL(req.url, req.headers.origin);
      const connId = reqUrl.searchParams.get('me')

      const clientTimer = new Timer(CLIENT_TIMEOUT, () => {
        console.log("client", shortId(connId), "timeout");
        socket.close();
        if (connections.hasOwnProperty(connId)) {
          delete connections[connId];
          this.eventHandlers.leave.forEach(handler => handler(connId, connections));
        }        
      });

      socket.sendJSON = function(json) {
        if (json.type !== "pong") console.log(shortId(connId), "<-- ", json);
        this.send(JSON.stringify(json));
      }

      clientTimer.set();
      connections[connId] = socket;
      this.eventHandlers.arrive.forEach(handler => handler(connId, socket, connections));

      socket.on('open', () => {
        // Seems to never occur for incoming connections
        console.log("client", shortId(connId), "open");
      });

      socket.on('message', data => {
        clientTimer.set();
        // const sliced = data.length > 40 ? data.slice(0,40)+"..." : data;

        let parsed;
        try {
          parsed = recvJSON(data, connId);
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
        clientTimer.set();
        // Browsers can't send pings, but we send back pongs anyway, just in case
        socket.pong();
      });

      socket.on('close', (code, reason) => {
        // console.log("client", shortId(connId), "closed. code:", code, "reason:", reason);
        if (connections.hasOwnProperty(connId)) {
          clientTimer.unset();
          delete connections[connId];
          this.eventHandlers.leave.forEach(handler => handler(connId, connections));
        }
      });
    });
  }

  on(eventName, callback) {
    this.eventHandlers[eventName].push(callback);
  }
}

// Some example handlers:

// Logs arrive/leave events
function logArrivalDeparture(server) {
  server.on('arrive', (connId, socket, connections) => {
    console.log("client", shortId(connId), "arrive.", "clients:", Object.keys(connections));
  })

  server.on('leave', (connId, connections) => {
    console.log("client", shortId(connId), "leave.", "clients:", Object.keys(connections));
  })
}

// Broadcasts list of peers to everyone, whenever someone arrives or leaves
function notifyPeers(server) {
  let connections = null;
  server.on('listening', cs => {
    connections = cs;
  });
  function notify() {
    peers = Object.keys(connections);
    Object.entries(connections).forEach(([connId, socket]) => {
      socket.sendJSON({
        type: "push",
        what: "peers",
        data: {peers, you: connId},
      });
    });
  }
  server.on('arrive', (connId, socket) => {
    notify();
  });

  server.on('leave', (connId) => {
    notify();
  });
}

// Install a custom set of request handlers
function installRequestHandler(server, handlers) {
  server.on('receive', (connId, socket, parsed) => {
    // console.log("client", shortId(connId), "receiveReq", parsed);
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

  const requestReply = new RequestReply();

  server.on('receive', (connId, socket, parsed) => {
    if (parsed.type === "res") {
      requestReply.handleResponse(parsed)
    }
  });

  installRequestHandler(server, {
    "forw": ({to, msg}, reply, from) => {
      if (connections.hasOwnProperty(to)) {
        const toSocket = connections[to];
        const request = requestReply.createRequest("msg", {from, msg}, reply);
        toSocket.sendJSON(request);
      } else {
        reply("unknown 'to'");
      }
    }
  });
}


module.exports = {
  Server,
  logArrivalDeparture,
  notifyPeers,
  installRequestHandler,
  messagingBroker,
}
