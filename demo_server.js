// Runs a HTTP file server and WebSocket server
// Navigate browser to http://localhost:9000/client.html

const port = process.argv[2] || 9000;


const http = require('http');
const handler = require('serve-handler');
const {Server, logArrivalDeparture, notifyPeers, installRequestHandler, messagingBroker} = require('./server');


const server = http.createServer((request, response) => {
  // You pass two more arguments for config and middleware
  // More details here: https://github.com/vercel/serve-handler#options
  console.log(request.method, request.url)
  return handler(request, response);
})


const wsServer = new Server({server, path: "/websocket"});

// install handlers

logArrivalDeparture(wsServer);

notifyPeers(wsServer);

installRequestHandler(wsServer, {
  "hello": (data, reply) => reply(null, "world!"),
});

messagingBroker(wsServer);

server.listen(parseInt(port));

console.log(`Server listening on port ${port}`);
console.log(` - Static file server (${process.cwd()}) at /`)
console.log(` - Broker service at /websocket`)
