
class RequestReply {
  constructor() {
    this.nextId = 0;
    this.pending = {};
  }

  createRequest(what, data, responseCallback) {
    const id = this.nextId++;
    const request = {type: "req", id, what, data};
    // store the request itself, so we can retransmit it if necessary
    this.pending[id] = [request, responseCallback];
    return request;
  }

  handleResponse({id, err, data}) {
    if (this.pending.hasOwnProperty(id)) {
      const [, responseCallback] = this.pending[id];
      delete this.pending[id];
      if (responseCallback) {
        responseCallback(err, data);
      }
    }
  }

  getPending() {
    return Object.values(this.pending);
  }

  clearPending() {
    this.pending = {};
  }
}


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

function shortUUID(uuid) {
  return uuid.substring(0, 8);
}

if (typeof window === 'undefined') {
  // We're on NodeJS
  module.exports = { RequestReply, Timer, shortUUID }
}

