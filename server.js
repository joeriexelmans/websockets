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
    };
  }

  on(eventName, callback) {
    this.eventHandlers[eventName].push(callback);
  }

  listen(port) {
    const server = new WebsocketServer({port});
    let nextConnId = 0;
    const connections = {};

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
        
        this.eventHandlers.receive.forEach(handler => handler(connId, socket, data));
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



function logArrivalDeparture(server) {
  server.on('arrive', (connId, socket, connections) => {
    console.log("client", connId, "arrive", "clients:", Object.keys(connections));
    socket.sendJSON({
      type: "push",
      what: "welcome",
    });
  })

  server.on('leave', (connId, connections) => {
    console.log("client", connId, "leave", "clients:", Object.keys(connections));
  })
}

function installRequestResponseProtocol(server, handlers) {
  server.on('receive', (connId, socket, data) => {
    console.log("client", connId, "receive", parsed);
    if (parsed.type === "req") {
      const {id, what, data} = parsed;
      if (!Number.isInteger(id)) {
        return; // invalid request
      }
      const reply = (err, data) => {
        socket.sendJSON({ type: "res", id, err, data });
      };
      if (handlers.hasOwnProperty(what)) {
        handlers[what](data, reply);
      } else {
        reply("invalid request: " + what)
      }
    }
  })
}

const s = new Server();
logArrivalDeparture(s);
installRequestResponseProtocol(s, {
  "hello": (data, reply) => reply(null, "world"),
});
s.listen(8010);
