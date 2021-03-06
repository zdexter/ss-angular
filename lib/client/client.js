//client script for model syncing.

var ss = require('socketstream');

var requestId = 0; //only needs to be unique within a session since server uses middleware
var callbacks = {};

function parseRequest() {
  var r = {};
  var args = Array.prototype.slice.call(arguments[0]);
  r.modelName = args[0];
  r.params = args[1];
  r.callBack = args[2];

  if(r.params) {
    try {
      r.paramString = JSON.stringify(r.params);
    }
    catch(e) {
      throw new Error("params must be a single JSON object",e);
    }
  }
  else {
    r.paramString = "*";
  }

  if(!r.modelName || r.modelName.length === 0) {
    throw new Error("Invalid model name");
  }

  r.requestName = r.modelName + "/" + r.paramString;
  return r;
}


module.exports = function(responderId, config, send) {
  ss.registerApi('linkModel', function() {
    var req = parseRequest(arguments);

    if(callbacks[req.requestName]) {
      throw new Error("Already syncing the model. Duplicate subscriptions not currently supported");
    }
    else {
      console.log("Syncing model " + req.requestName + " with the server");
      var request = {
        m: "LINK",
        n: req.modelName,
        p: req.params
      };
      callbacks[req.requestName] = req.callBack;
      send(JSON.stringify(request));
    }
  });

  ss.registerApi('unlinkModel', function() {
    var req = parseRequest(arguments);
    if(!callbacks[req.requestName]) {
      return;
    }

    var request = {
      m: "UNLINK",
      n: req.modelName,
      p: req.params
    };
    send(JSON.stringify(request));
  });

  ss.message.on(responderId, function(msg) {
    var res = JSON.parse(msg);
    if(res.r === "OK") {
      if(res.o && res.n) {
        var cb = callbacks[res.n];
        if(!cb) {
          throw Error("Unknown model id: " + res.n);
        }
        else {
          cb(res.o);
        }
      }
      else if(res.m && res.i) {
        console.log("Received confirmation of " + res.m + " with status: " + res.i);
        if(res.m === "UNLINK") {
          if(!callbacks[res.n]) {
            throw Error("Unknown model id for unsubscribe: " + JSON.stringify(res));
          }
          else {
            delete callbacks[res.n];
          }
        }
      }
      else {
        throw new Error("Unknown response: " + JSON.stringify(res));
      }
    }
    else if(res.r === "NOAUTH") {
      console.log("No credentials for model");
      delete callbacks[res.n];
    }
    else {
      throw new Error("Server error: " + JSON.stringify(res));
    }
  });
};
