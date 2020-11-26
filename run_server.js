const server = require('./server');

const s = new server.Server();

// register handlers
server.logArrivalDeparture(s);
server.notifyPeers(s);
server.installRequestResponseProtocol(s, {
  "hello": (data, reply) => reply(null, "world"),
});
server.messagingBroker(s);


s.listen(8010);
