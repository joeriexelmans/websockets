const CLIENT_TIMEOUT = 1000; // ms

const port = 8010;
const nginx_rev_proxy = false;

class InvalidRequest extends Error {}

console.log("Listening on " + port);

const connections = {};
const timers = {};
let nextId = 0;

var WebSocketServer = require('ws').Server
, wss = new WebSocketServer({port});

function checkReq(cond, msg) {
  if (!cond) throw new InvalidRequest(msg);
}

function sendJSON(ws, json) {
  ws.send(JSON.stringify(json));
}

function sendPush(ws, what, param) {
  sendJSON(ws, {what, param});
  // return {push: { what, param }};
}

function pushSetPeers(you) {
  Object.values(connections).forEach(ws => {
    sendPush(ws, "setPeers", {
      you,
      peers: Object.keys(connections).filter(p => p != you),
    })
  });
}

wss.on('connection', function(ws, req) {
  const connId = (nextId++).toString(); // unique ID for every connection

  console.log("Client %s joined", connId)

  // store connection
  connections[connId] = ws;

  // notify others
  pushSetPeers(connId);

  // let connTimeout = null;

  // const resetTimeout = () => {
  //   if (connTimeout !== null) clearTimeout(connTimeout);
  //   connTimeout = setTimeout(() => {
  //     ws.close();
  //     delete connections[connId];
  //     console.log("Client %s timeout", connId)
  //     pushSetPeers();
  //   }, CLIENT_TIMEOUT);
  // }


  ws.on('message', function(message) {
    console.log('Received from client: %s', message);

    // resetTimeout();

    let reqId, cmd, param;

    const sendReply = param => {
      sendJSON(this, { reqId, param });
    };

    const sendErr = err => {
      sendJSON(this, { reqId, err });
    }

    try {
      ({reqId, cmd, param} = JSON.parse(message));

      if (!Number.isInteger(reqId)) throw Error("invalid reqId");

      switch (cmd) {
      case "lspeers":
        sendReply({
          peers: Object.keys(connections),
        });
        break;
      case "broadcast":
        Object.values(connections).forEach(ws => {
          sendPush(ws, "broadcast", {
            from: connId,
            msg: param.msg,            
          })
        });
        break;
      case "narrowcast":
        const {dst, msg} = param;
        checkReq(dst in connections, "invalid dst");
        sendPush(connections[dst], "narrowcast", {
          from: connId,
          reqId,
          msg: param.msg,
        });
        sendReply();
        break;
      case "ping":
        sendReply();
        break;
      case "leave":
        delete connections[connId];
        console.log("Client %s left", connId)
        sendReply();
        break;
      default:
        throw new InvalidRequest("invalid command: " + cmd)
      }
    } catch (e) {
      if (e instanceof InvalidRequest) {
        sendErr(e.message);
      } else {
        console.log("Caught", e)
        sendErr("server error");
      }
    }
  });
});

