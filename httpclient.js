var net = require("net");
var sys = require("util");
var dns = require("dns");
var HTTPParser = process.binding("http_parser").HTTPParser;
var compress = require("compress");
var events = require("events");

var _err_codes = {
	"QUEUE_LIMIT_EXCEEDED": {
		"code": 1,
		"text": "request queue limit exceeded"
	},
	"WRITE_READ_ONLY": {
		"code": 2,
		"text": "attempting to write a read-only stream."
	},
	"CLIENT_TIMEOUT": {
		"code": 3,
		"text": "timeout on client connection."
	},
	"CLIENT_ERROR": {
		"code": 4,
		"text": "error on client connection."
	},
	"INCOMPLETE_RESPONSE_ON_CLOSE": {
		"code": 5,
		"text": "a message response was incomplete when the connection was closed."
	},
	"CLOSE_UNWRITTEN_REQUEST": {
		"code": 6,
		"text": "connection was closed during request write"
	},
	"WRITTEN_QUEUE_EMPTY": {
		"code": 7,
		"text": "a message was received but the written queue was empty."
	},
	"PARSER_NOT_INITIALISED": {
		"code": 8,
		"text": "parser not initialized prior to Client.ondata call."
	}
};

var _client_states = {
	"DISCONNECTED": 0,
	"CONNECTING": 1,
	"CONNECTED": 2
};

var _states = {
	"open": "open",
	"closed": "closed",
	"readOnly": "readOnly",
	"writeOnly": "writeOnly",
	"opening": "opening",
}

var _loglevels = {
	"NONE": 0x0,
	"DEBUG": 0x1,
	"WARN": 0x2,
	"ERR": 0x4,
	"CRIT": 0x8,
	"ALL": 0xF
};

function Client(options) {
//TODO: investigate what a writeonly stream would be in the http world...
//TODO: sort out content encodings
//TODO: allow turning cookie support off and on
//TODO: define request object
//TODO: add https handshake callback and allow abort if credentials do not pass
//TODO: pre-allocate the queue with requests so we are not doing lots of on the fly allocations/news
	var _options = options;
	var _self = this;
	var _current = null;

	_self.port = _options.port || 80;
	_self.host = _options.host || "127.0.0.1";
	_self.hostip = _self.host;
	_self.timeout = _options.timeout || 60000;
	_self.nodelay = _options.nodelay || false;
	_self.keepalive = _options.keepalive || false;
	_self.initialDelay = _options.initialDelay || 0;	
	_self.loglevel = _options.loglevel || (_loglevels.ERR | _loglevels.CRIT);
	_self.pipeline = _options.pipeline || false;
	_self.pipelinelimit = _options.pipelinelimit || 10;
	_self.queuelimit = _options.queuelimit || 10;
	_self.https = _options.https || false;
	_self.logstream = _options.logstream || null;
	_self.cookies = _options.cookies || [];
	_self.autoconnect = _options.autoconnect || false;
	_self.addresses = [];
	_self.queue = [];
	_self.written = [];
	_self.sequence = 0;
	_self.state = _client_states.DISCONNECTED;
		
	var parser = new HTTPParser('request');
	var gunzip = new compress.Gunzip;
	var httpClient = new net.Stream();

	function logmessage(message, level) {
		if(_self.logstream && (_self.loglevel & level)) {
			try {
				_self.logstream.write(new Date().getTime() + ": " + message + "\n");
			}
			catch(exception) {
				_self.emit("logerror", exception);
				_self.loglevel = _loglevels.NONE;
			}
		}
	}
	
	function decode() {
		var request = this;
		if(request.response.encoding == "binary") {
			gunzip.init();
			request.response.body = gunzip.inflate(request.response.body, "binary");
			gunzip.end();
		}
		if(request.response.headers && request.response.headers["content-type"]) request.response.encoding = request.response.headers["content-type"][0];
	}
	
	function connect(resolve) {
		if(_self.state == _client_states.DISCONNECTED) {
			_self.state = _client_states.CONNECTING;
			if(resolve || _self.addresses.length == 0) {
				if(_options.host) {
					dns.resolve4(_self.host, function (err, addresses) {
						logmessage("httpclient.resolve", _loglevels.DEBUG);
						_self.emit("resolve", err, _self.hostip);
						if (!err) {
							_self.addresses = addresses;
							_self.hostip = addresses[0];
							httpClient.connect(_self.port, _self.hostip);
						}
					});
				}
			}
			else {
				httpClient.connect(_self.port, _self.hostip);
			}
		}
	}

	function writeRequest(socket, request) {
	//TODO: optimise this and don't do cookie processing if option is off
		var headers = {
			"User-Agent": "Node-Http",
			"Accept" : "*/*",
			"Connection" : "Keep-Alive",
			"Host" : request.host
		};
		if(request.request.method == "POST") {
			headers["Content-Length"] = request.request.body.length;
			headers["Content-Type"] = "application/x-www-form-urlencoded";
		}
		for (attr in request.request.headers) { headers[attr] = request.request.headers[attr]; }
		if(request.request.cookies) {
			var mycookies = [];
			_self.cookies.filter(function(value, index, arr) {
				//console.log(JSON.stringify(request, null, "\t"));
				if(request.request.path) {
					return(request.host.substring(request.host.length - value.domain.length) == value.domain && request.request.path.indexOf(value.path) >= 0);
				}
				else {
					return(request.host.substring(request.host.length - value.domain.length) == value.domain);
				}
			}).forEach( function(cookie) {
				mycookies.push(cookie.key + "=" + cookie.value);
			});
			if( mycookies.length > 0 ) {
				headers["Cookie"] = mycookies.join(";");
			}
		}
		var hdr = "";
		for (attr in headers) {
			hdr+= attr + ": " + headers[attr] + "\r\n"; 
		}
		logmessage("httpclient.client.writeRequest: " + request.seq, _loglevels.DEBUG);
		_self.written.push(request);
		if(request.request.body) {
			request.state.flushed = httpClient.write(request.request.method + " " + request.request.path + " HTTP/1.1\r\n" + hdr + "\r\n" + request.request.body);
		}
		else {
			request.state.flushed = httpClient.write(request.request.method + " " + request.request.path + " HTTP/1.1\r\n" + hdr + "\r\n");
		}
		request.state.written = new Date().getTime();
		if(request.state.flushed) request.state.flushed = request.state.written;
		if(request.request.callbacks.written) {
			request.request.callbacks.written(request);
		}
		if(request.state.flushed && request.request.callbacks.flushed) {
			request.request.callbacks.flushed(request);
		}
		//TODO: what errors can happen here?? should we do a try/catch?
		if(_self.written.length > 0) _current = _self.written[0];
	}
	
	function writeQueue() {
	//TODO: optimise this
		switch(httpClient.readyState) {
			case _states.open:
			case _states.writeOnly:
				if(_self.queue.length > 0) {
					while(_self.queue.length > 0 && (_self.written.length == 0 || (_self.pipeline && (_self.written.length < _self.pipelinelimit)))) {
						writeRequest(httpClient, _self.queue.shift());
					}
				}
				break;
			case _states.opening:
				break;
			case _states.closed:
				if(_self.autoconnect) {
					connect();
				}
//				connect();
				break;
			default:
				if(_self.queue.length > 0) {
					while(_self.queue.length > 0) {
						var request = _self.queue.shift();
						//INFO: Trying to write a read-only stream
						if(request.request.cb) {
							request.request.cb({"error": _err_codes.WRITE_READ_ONLY.code, "text": _err_codes.WRITE_READ_ONLY.text, "readyState": httpClient.readyState}, request);
						}
					}
				}
				break;
		}
	}
	
	parser.onMessageBegin = function () {
		logmessage("httpclient.parser:message:begin", _loglevels.DEBUG);
		if(_self.written.length > 0) {
			_current = _self.written[0];
			//TODO: check if request was written. if it wasn't, we shouldn't be parsing a response for it...
			_current.response.info = null;
			_current.response.headers = {};
			_current.response.body = "";
			_current.state.started = new Date().getTime();
			_current.response.encoding = "utf8";
			_current.errors = [];
			if(_current.request.callbacks.started) {
				_current.request.callbacks.started(_current);
			}
		}
		else {
			_self.emit("error", {"error": _err_codes.WRITTEN_QUEUE_EMPTY.code, "text": _err_codes.WRITTEN_QUEUE_EMPTY.text, "exception": new Error("message received on empty queue")});
			httpClient.end();
		}
	};
	
	parser.onHeaderField = function (b, start, len) {
	//TODO: optimise this - maybe allow only storing raw headers
		var slice = b.toString('ascii', start, start+len).toLowerCase();
		if (parser.value) {
			if(_current.response.headers[parser.field]) {
				_current.response.headers[parser.field].push(parser.value);
			}
			else {
				_current.response.headers[parser.field] = [parser.value];
			}
			if(parser.field == "content-encoding") {
				if(parser.value == "gzip") {
					_current.response.encoding = "binary";			
				}
			}
			//TODO: move header logic to onHeadersComplete
			//TODO: check connection header so we know whether to close or not at end of request
			parser.field = null;
			parser.value = null;
		}
		if (parser.field) {
			parser.field += slice;
		} else {
			parser.field = slice;
		}
	};
	
	parser.onHeaderValue = function (b, start, len) {
		var slice = b.toString('ascii', start, start+len);
		if (parser.value) {
			parser.value += slice;
		} else {
			parser.value = slice;
		}
	};
	
	parser.onHeadersComplete = function (info) {
		logmessage("httpclient.parser.headers.complete", _loglevels.DEBUG);
		_current.response.info = info;
		_current.state.headersComplete = new Date().getTime();
		if(info.shouldKeepAlive) writeQueue();
		//TODO: optimise this
		if(_current.request.cookies) {
			if(_current.response.headers["set-cookie"]) {
				_current.response.headers["set-cookie"].forEach( function( cookie ) {
					props = cookie.split(";");
					var newcookie = {
						"key": "",
						"value": "",
						"domain": "",
						"path": "/",
						"expires": ""
					};
					var parts = props.shift().split("=");
					newcookie.value = parts[1];
					newcookie.key = parts[0];
					props.forEach( function( prop ) {
						var parts = prop.split("="),
						name = parts[0].trim();
						switch(name.toLowerCase()) {
							case "domain":
								newcookie.domain = parts[1].trim();
								break;
							case "path":
								newcookie.path = parts[1].trim();
								break;
							case "expires":
								newcookie.expires = parts[1].trim();
								break;
						}
					});
					if(newcookie.domain == "") newcookie.domain = _self.host;
					var match = _self.cookies.filter(function(value, index, arr) {
						if(value.domain == newcookie.domain && value.path == newcookie.path && value.value.split("=")[0] == newcookie.value.split("=")[0]) {
							arr[index] = newcookie;
							return true;
						}
						else {
							return false;
						}
					});
					if(match.length == 0) _self.cookies.push(newcookie);
				});
			}
		}
		if(_current.request.callbacks.headersComplete) {
			_current.request.callbacks.headersComplete(_current);
		}
		//TODO: cb with headers
		//TODO: check info.shouldKeepAlive
	};
	
	parser.onBody = function (b, start, len) {
		if(!_current.state.bodyStarted) {
			_current.state.bodyStarted = new Date().getTime();
		}
		logmessage("httpclient.parser.body", _loglevels.DEBUG);
		if(_current.request.bodyStream) {
			_current.request.bodyStream.write(b.toString("binary", start, start+len), "binary");
		}
		else {
			_current.response.body+=b.toString(_current.response.encoding, start, start + len);
		}
	};
	
	parser.onMessageComplete = function () {
		logmessage("httpclient.parser.message.complete", _loglevels.DEBUG);
		if(!_current.state.bodyComplete) {
			_current.state.bodyComplete = new Date().getTime();
			if(_current.request.callbacks.bodyComplete) {
				_current.request.callbacks.bodyComplete(_current);
			}
		}
		//TODO: fix the encoding handling
		//TODO: check content type header for response encoding. "content-type":["text/xml; charset=utf-8"]
		if(!_current.request.bodyStream) {
			decode.apply(_current);
		}
		else {
			//_current.request.bodyStream.end();
		}
		_current.state.complete = new Date().getTime();
		if(_current.request.callbacks.complete) {
			_current.request.callbacks.complete(null, _current);
		}
		logmessage("httpclient.parser.message.end", _loglevels.DEBUG);
		_self.written.shift();
		if(_current.response.info.shouldKeepAlive) {
			writeQueue();
		}
		else {
			httpClient.end();
		}
		if(_self.written.length > 0) {
			_current = _self.written[0];
		}
		else
		{
			_current = null;
		}
		//INFO: request object should now be free to be collected (as long as client is not holding a reference) as it is off the queue already.
	};

	httpClient.addListener("connect", function () {
		_self.state = _client_states.CONNECTED;
		logmessage("httpclient.client.connect", _loglevels.DEBUG);
		//TODO: is this necessary? assume it is used to kill off a dead connection
		httpClient.setKeepAlive(_self.keepalive, _self.initialDelay);
		httpClient.setTimeout(_self.timeout);
		httpClient.setNoDelay(_self.nodelay);
		if(_self.https) {
			httpClient.setSecure();
		}
		else {
			_self.emit("connect", null, _self.hostip);
			parser.reinitialize('response');
			parser.socket = httpClient;
			writeQueue();
		}
	});
	
	httpClient.addListener("secure", function () {
		_self.emit("connect", null, _self.hostip);
		logmessage("httpclient.client.secure", _loglevels.DEBUG);
		parser.reinitialize('response');
		parser.socket = httpClient;
		var verified = httpClient.verifyPeer();
		//INFO: write out any pending requests
		writeQueue();
		//TODO: callback for certificate validation
		//var peerDN = JSON.stringify(httpClient.getPeerCertificate());
	});
	
	httpClient.ondata = function (d, start, end) {
		logmessage("httpclient.client.data", _loglevels.DEBUG);
		if (!parser) {
			_self.emit("error", {"error": _err_codes.PARSER_NOT_INITIALISED.code, "text": _err_codes.PARSER_NOT_INITIALISED.text});
			httpClient.end();
		}
		else {
			var bytesParsed = parser.execute(d, start, end - start);
			//TODO: if no bytes parsed do we do anything?
		}
	};

	//TODO: is this an event??	
	httpClient.addListener("end", function () {
		logmessage("httpclient.client.end", _loglevels.DEBUG);
		httpClient.end();
	});
	
	httpClient.addListener("drain", function () {
		//TODO: monitor when buffer is free
		logmessage("httpclient.client.drain", _loglevels.DEBUG);
		//TODO: make this more efficient -walk back the queue until we see a request that has been written
		_self.written.forEach(function(request) {
			if(!request.state.flushed) {
				if(request.request.callbacks.flushed) {
					request.request.callbacks.flushed(request);
				}
				request.state.flushed = new Date().getTime();
			}
		});
	});
	
	httpClient.addListener("error", function (exception) {
		logmessage("httpclient.client.error: " + JSON.stringify(exception), _loglevels.ERR);
		_self.written.forEach(function(request) {
			request.errors.push({"error": _err_codes.CLIENT_ERROR.code, "text": _err_codes.CLIENT_ERROR.text, "exception": exception});
		});
	});
	
	httpClient.addListener("timeout", function () {
		logmessage("httpclient.client.timeout", _loglevels.WARN);
		_self.written.forEach(function(request) {
			request.errors.push({"error": _err_codes.CLIENT_TIMEOUT.code, "text": _err_codes.CLIENT_TIMEOUT.text});
		});
	});
	
	httpClient.addListener("close", function (had_error) {
		_self.state = _client_states.DISCONNECTED;
		logmessage("httpclient.client.close: " + had_error, _loglevels.DEBUG);
		//INFO: return the pending requests in the close event
		//TODO: call back each request that is not complete
		_self.written.forEach(function(request) {
			var err = null;
			if(!request.state.complete) {
				if(!request.state.flushed) {
					err = {"error": _err_codes.CLOSE_UNWRITTEN_REQUEST.code, "text": _err_codes.CLOSE_UNWRITTEN_REQUEST.text};
				}
				else {
					if(!request.state.bodyComplete) decode.apply(request);
					err = {"error": _err_codes.INCOMPLETE_RESPONSE_ON_CLOSE.code, "text": _err_codes.INCOMPLETE_RESPONSE_ON_CLOSE.text};
				}
			}
			if(request.request.callbacks.complete) {
				request.request.callbacks.complete(err, request);
			}
		});
		_self.written = [];
		_current = null;
		_self.emit("close", had_error);
	});
	
	_self.perform = function(req) {
		var request = {
			"seq": ++_self.sequence,
			"state": {
				"queued": false,
				"written": false,
				"flushed": false,
				"started": false,
				"headersComplete": false,
				"bodyStarted": false,
				"bodyComplete": false,
				"complete": false
			},
			"request": req,
			"response": {},
			"errors": [],
			"host": _self.host,
			"host_ip": _self.hostip
		}
		if(_self.queue.length < _self.queuelimit) {
			_self.queue.push(request);
			request.state.queued = new Date().getTime();
			if(req.callbacks.queued) {
				req.callbacks.queued(request);
			}
			writeQueue();
		}
		else if(req.callbacks.complete) {
			req.callbacks.complete({"error": _err_codes.QUEUE_LIMIT_EXCEEDED.code, "text": _err_codes.QUEUE_LIMIT_EXCEEDED.text, "readyState": httpClient.readyState}, request);
		}
	}
	
	_self.shutdown = function() {
		logmessage("httpclient.client.shutdown", _loglevels.DEBUG);
		_self.logstream = null;
		httpClient.destroy();
		_self.state = _client_states.DISCONNECTED;
		_self.emit("shutdown");
	}
	
	_self.connect = connect;
}
sys.inherits(Client, events.EventEmitter);
exports.Client = Client;
exports.errors = _err_codes;
exports.states = _client_states;
exports.loglevels = _loglevels;