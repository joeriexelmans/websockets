const CLIENT_PING_INTERVAL = 300; // ms, interval for sending ping to server
const SERVER_TIMEOUT = 1000; // ms, time before lack of server response is considered a timeout
const TIMEOUT_THRESHOLD = 3; // number of missed replies

class Client {
  constructor() {
    this.socket = null;
    this.timeoutCtr = 0;
    this.reqCtr = 0;
    this.requests = {};

    this.clientTimeout = null; // after this timeout, the client will send a ping
    this.serverTimeout = null; // after this timeout, a request to the server is considered 'timed out'
  }

  connect(addr) {
    this.socket = new WebSocket(addr);

    this.socket.onmessage = msg => {
      const parsed = JSON.parse(msg.data)
      // if (parsed.param !== undefined || parsed.err !== undefined) {
        console.log("Received", parsed);
      // }
      
      const {reqId, param, err} = parsed;
      if (reqId !== undefined && reqId in this.requests) {
        const callback = this.requests[reqId];
        delete this.requests[reqId];
        callback(err, param);
      }
    }

    // this.socket.onopen = () => {
    //   // start sending pings
    //   this._resetClientTimeout();
    // };

    // this.socket.onclose = () => {
    //   if (this.clientTimeout !== null) {
    //     window.clearTimeout(this.clientTimeout);
    //   }
    // }
  }

  // _resetClientTimeout() {
  //     if (this.clientTimeout !== null) {
  //       window.clearInterval(this.clientTimeout);
  //     }
  //     this.clientTimeout = window.setTimeout(() => {
  //       this.request("ping", null, () => {});
  //       this.clientTimeout = null;
  //     }, CLIENT_PING_INTERVAL);
  // }

  request(cmd, param, callback) {
    if (this.socket == null) {
      callback("not connected");
    }

    const reqId = this.reqCtr++;

    this.socket.send(JSON.stringify({
      reqId,
      cmd,
      param,
    }));

    // const serverTimeout = window.setTimeout(() => {
    //   this.timeoutCtr++;
    //   delete this.requests[reqId];

    //   if (timeoutCtr > TIMEOUT_THRESHOLD) {
    //     socket = null;
    //     console.log("Server timeout")
    //   }
    // }, SERVER_TIMEOUT);

    // // delay next ping
    // this._resetClientTimeout();

    this.requests[reqId] = (err, data) => {
      // window.clearTimeout(serverTimeout);
      callback(err, data);
    };
  }

  disconnect() {
    this.request("leave", null, (err, data) => {
    })
  }
}


window.onbeforeunload = function(){
  // socket.onclose = function () {};
  // socket.close();
  client.disconnect();
}


const client = new Client();
client.connect("ws://localhost:8010/");


