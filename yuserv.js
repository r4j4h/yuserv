var sys = require("sys");
var fs = require("fs");
var http = require("http");
var url = require("url");
var httpClient = require("./httpclient");

var yuserv = exports;
 
var NOT_FOUND = "Not Found\n";
var fuip = "127.0.0.1";
var fuport = 8000;
var fufilesdir = "../vids";
var myurl = "http://www.google.com/";
var urlregex = new RegExp("(https?|ftp)://([-A-Z0-9.]+)(/[-A-Z0-9+&@#/%=~_|!:,.;]*)?(\\?[-A-Z0-9+&@#/%=~_|!:,.;]*)?", "i");
var uidregex = new RegExp("http://www\\.youtube\\.com/watch\\??([-A-Za-z0-9+&@#/%=~_|!:,.;]*)?");

var _formats = {
	"34": {
		"name": "Standard",
		"container": "flv",
		"video": {
			"encoding": "MPEG-4 AVC (H.264)",
			"max-aspect-ratio": "4:3",
			"max-res": "640x480"
		},
		"audio": {
			"encoding": "AAC",
			"channels": "2 (stereo)",
			"sample-rate": "44100"
		}
	},
	"18": {
		"name": "Medium",
		"container": "mp4",
		"video": {
			"encoding": "MPEG-4 AVC (H.264)",
			"max-aspect-ratio": "4:3",
			"max-res": "480x360"
		},
		"audio": {
			"encoding": "AAC",
			"channels": "2 (stereo)",
			"sample-rate": "44100"
		}
	},
	"35": {
		"name": "High",
		"container": "flv",
		"video": {
			"encoding": "MPEG-4 AVC (H.264)",
			"max-aspect-ratio": "16:9",
			"max-res": "854x480"
		},
		"audio": {
			"encoding": "AAC",
			"channels": "2 (stereo)",
			"sample-rate": "44100"
		}
	},
	"22": {
		"name": "720p",
		"container": "mp4",
		"video": {
			"encoding": "MPEG-4 AVC (H.264)",
			"max-aspect-ratio": "16:9",
			"max-res": "1280x720"
		},
		"audio": {
			"encoding": "AAC",
			"channels": "2 (stereo)",
			"sample-rate": "44100"
		}
	},
	"37": {
		"name": "1080p",
		"container": "mp4",
		"video": {
			"encoding": "MPEG-4 AVC (H.264)",
			"max-aspect-ratio": "16:9",
			"max-res": "1920x1080"
		},
		"audio": {
			"encoding": "AAC",
			"channels": "2 (stereo)",
			"sample-rate": "44100"
		}
	},
	"17": {
		"name": "Mobile",
		"container": "3gp",
		"video": {
			"encoding": "MPEG-4 Visual",
			"max-aspect-ratio": "11:9",
			"max-res": "176x144"
		},
		"audio": {
			"encoding": "AAC",
			"channels": "2 (stereo)",
			"sample-rate": "44100"
		}
	},
	"0": {
		"name": "Old-Standard",
		"container": "flv",
		"video": {
			"encoding": "H.263",
			"max-aspect-ratio": "4:3",
			"max-res": "320x240"
		},
		"audio": {
			"encoding": "MP3",
			"channels": "1 (mono)",
			"sample-rate": "22050"
		}
	},
	"5": {
		"name": "Old-Standard",
		"container": "flv",
		"video": {
			"encoding": "H.263",
			"max-aspect-ratio": "4:3",
			"max-res": "320x240"
		},
		"audio": {
			"encoding": "MP3",
			"channels": "1 (mono)",
			"sample-rate": "22050"
		}
	},
	"6": {
		"name": "Old-High",
		"container": "flv",
		"video": {
			"encoding": "H.263",
			"max-aspect-ratio": "4:3",
			"max-res": "480x360"
		},
		"audio": {
			"encoding": "MP3",
			"channels": "1 (mono)",
			"sample-rate": "44100"
		}
	},
	"13": {
		"name": "Old-Mobile",
		"container": "3gp",
		"video": {
			"encoding": "H.263",
			"max-aspect-ratio": "11:9",
			"max-res": "176x144"
		},
		"audio": {
			"encoding": "AMR",
			"channels": "1 (mono)",
			"sample-rate": "8000"
		}
	}
}

function downloadfile(durl, vdir, title) {
	var myregexp = new RegExp("[^\\w]", "g");
	var safetitle = title.replace(myregexp, "_");
	var fn = vdir + "/" + safetitle + ".flv";
	var thisurl = url.parse(durl);
	var client = new httpClient.Client({
		"port": 80, 
		"host": thisurl.hostname, 
		"timeout": 10000, 
		"nodelay": true, 
		"keepalive": true,
		"initialDelay": 15000,
		"pipeline": false,
		"pipelinelimit": 10,
		"queuelimit": 100,
		"https": false,
		"loglevel": httpClient.loglevels.ALL,
		"logstream": process.stdout,
		"cookies": [],
		"autoconnect": true
	});
	client.perform({
		"method": "GET",
		"path": thisurl.pathname + thisurl.search,
		"headers": {
			"User-Agent": "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; .NET CLR 2.0.50727; .NET CLR 1.1.4322; .NET CLR 3.0.4506.2152; .NET CLR 3.5.30729)",
			"Accept-Encoding": "gzip",
			"Connection": "close"
		},
		"callbacks": {
			"headersComplete": function(request) {
				//logmessage("httptest.request:headersComplete: " + JSON.stringify(request.state), _loglevels.DEBUG);
				if(request.response.info.statusCode == 200) {
					//sys.puts(JSON.stringify(request.response.headers));
					request.request.bodyStream = fs.createWriteStream(fn, {"flags": "w", "encoding": "binary", "mode": 0777});
				}
			},
			"complete": function(err, request) {
				request.state.time = request.state.complete - request.state.queued;
				request.state.latency = request.state.started - request.state.flushed;
				request.state.proc = request.state.complete - request.state.started;
				//logmessage("httptest.request:complete: " + JSON.stringify(request.state), _loglevels.DEBUG);
				if(err) {
					//logmessage("httptest.request:complete:error: " + JSON.stringify(err), _loglevels.DEBUG);
				}
				yuserv.get("/vids/" + safetitle + ".html", yuserv.playerHandler("/vids/" + safetitle));
				yuserv.get("/vids/" + safetitle, yuserv.staticHandler(fn));
			}
		}
	});
}
 
function notFound(req, res) {
	res.writeHead(404, [["Content-Type", "text/plain"],["Content-Length", NOT_FOUND.length]]);
	res.write(NOT_FOUND);
	res.end();
}
 
var getMap = {};
 
yuserv.get = function (path, handler) {
	getMap[path] = handler;
};
 
var server = http.createServer(function (req, res) {
	if (req.method === "GET" || req.method === "HEAD") {
		var curl = url.parse(req.url);
		var handler = getMap[unescape(curl.pathname)] || notFound;
		handler(req, res);
	}
});

yuserv.listen = function (port, host) {
	fuip = host;
	fuport = port;
	server.listen(port, host);
	sys.puts("server running at http://" + (host || "127.0.0.1") + ":" + port.toString() + "/");
};
 
yuserv.close = function () { server.close(); };
 
function extname (path) {
	var index = path.lastIndexOf(".");
	return index < 0 ? "" : path.substring(index);
}

yuserv.playerHandler = function (filename) {
	return function (req, res) {
		body = "<html><head>";
		switch(getext(filename)) {
			case "flv":
				body += "<script type=\"text/javascript\" src=\"/flowplayer.js\"></script>";
				body += "<link rel=\"stylesheet\" type=\"text/css\" href=\"/style.css\">";
				body += "</head><body><div id=\"page\">";
				body += "<p>";
				body += "<a href=\"" + unescape(filename) + "\" style=\"display:block;width:520px;height:330px\" id=\"player\"></a>";
				body += "<script>flowplayer(\"player\", \"/flowplayer.swf\");</script>";
				body += "</p>";
				body += "</div>";
				body += "</body></html>";
				break;
			case "mp4":
				body += "</head><body><video autobuffer=\"false\" src=\"" + unescape(filename) + "\"/></body></html>";
				break;
		}
		headers = 
		[ 
			[ "Content-Type" , "text/html" ],
			[ "Content-Length" , body.length ]
		];
		res.writeHead(200, headers);
		res.write(body);
		res.end();
	}
};

function getext(filename) {
	return filename.split(".").pop();
}

yuserv.dirHandler = function (dirname) {
	var body, headers;
	
	function loadResponseData(callback) {
		if (body && headers) {
			callback();
			return;
		}
		
		fs.readdir(dirname, function(err, files) {
			body = "<html><head>";
			body += "<link rel=\"stylesheet\" type=\"text/css\" href=\"/style.css\">";
			body += "</head><body><div id=\"page\"><h1>BookMarklet</h1><p><a href=\"javascript:location='http://" + fuip + ":" + fuport + "/download/?url='+escape(location) \">Youtube-dl</a></p><h1>Videos</h1>";
		
			for (file in files){
				switch(getext(files[file])) {
					case "flv":
						body += "<p><a href=\"/vids/" + files[file] + ".html\">" + files[file] + "</a></p>";
						yuserv.get("/vids/" + files[file] + ".html", yuserv.playerHandler("/vids/" + files[file]));
						yuserv.get("/vids/" + files[file], yuserv.vidHandler(dirname + "/" + files[file]));
						break;
					case "mp4":
						body += "<p><a href=\"/vids/" + files[file] + ".html\">" + files[file] + "</a></p>";
						yuserv.get("/vids/" + files[file] + ".html", yuserv.playerHandler("/vids/" + files[file]));
						yuserv.get("/vids/" + files[file], yuserv.vidHandler(dirname + "/" + files[file]));
						break;
					default:
						break;			
				}
			}
			body += "</div></body></html>";
			headers = 
				[ 
					[ "Content-Type" , "text/html" ],
					[ "Cache-Control" , "public" ],
					[ "Content-Length" , body.length ]
				];
			callback();
		});
	}
	
	return function (req, res) {
		loadResponseData(function () {
			res.writeHead(200, headers);
			res.write(body);
			res.end();
		});
	}
};

yuserv.downloadHandler = function (dirname) {
	var status;
	var download = {
		"metaurl": "",
		"vidurl": "",
		"meta": null,
		"formats": {},
		"dirname": dirname
	};
	function loadResponseData(callback) {
		download.status = 400;
		var client = new httpClient.Client({
			"port": 80, 
			"host": "www.youtube.com", 
			"timeout": 10000, 
			"nodelay": true, 
			"keepalive": true,
			"initialDelay": 15000,
			"pipeline": false,
			"pipelinelimit": 10,
			"queuelimit": 100,
			"https": false,
			"loglevel": httpClient.loglevels.ALL,
			"logstream": process.stdout,
			"cookies": [],
			"autoconnect": true
		});
		client.perform({
			"method": "GET",
			"path": download.metaurl,
			"headers": {
				"User-Agent": "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; .NET CLR 2.0.50727; .NET CLR 1.1.4322; .NET CLR 3.0.4506.2152; .NET CLR 3.5.30729)",
				"Accept": "*/*",
				"Host": "www.youtube.com",
				"Accept-Encoding": "none",
				"Connection": "Keep-Alive"
			},
			"callbacks": {
				"complete": function(err, request) {
					request.state.time = request.state.complete - request.state.queued;
					request.state.latency = request.state.started - request.state.flushed;
					request.state.proc = request.state.complete - request.state.started;
					switch(request.response.info.statusCode)
					{
						case 200:
							download.meta = JSON.parse(request.response.body);
							title = download.meta["title"];
							client.perform({
								"method": "GET",
								"path": download.vidurl,
								"headers": {
									"User-Agent": "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; .NET CLR 2.0.50727; .NET CLR 1.1.4322; .NET CLR 3.0.4506.2152; .NET CLR 3.5.30729)",
									"Accept": "*/*",
									"Host": "www.youtube.com",
									"Accept-Encoding": "none",
									"Connection": "Keep-Alive"
								},
								"callbacks": {
									"complete": function(err, request) {
										request.state.time = request.state.complete - request.state.queued;
										request.state.latency = request.state.started - request.state.flushed;
										request.state.proc = request.state.complete - request.state.started;
										switch(request.response.info.statusCode)
										{
											case 200:
												buffy = [];
												lines = request.response.body.split("&");
												for(line in lines){
													buffy.push(unescape(lines[line]));
													parts = lines[line].split("=");
													if(parts[0] == "fmt_url_map"){
														map = parts[1];
														urls = map.split("%2C");
														for(var url in urls){
															parts = urls[url].split("%7C");
															download.formats[parts[0]] = unescape(parts[1]);
															download.formats[parts[0]] = _formats[parts[0]];
															download.formats[parts[0]].url = unescape(parts[1]);
															download.status = 200;
															if(parts[0] == "35"){
																download.status = 200;
																downloadfile(unescape(parts[1]), dirname, title);
																break;
															}
/*
															
															if(parts[0] == "37"){
																download.status = 200;
																//downloadfile(unescape(parts[1]), dirname, title);
																break;
															}
															if(parts[0] == "22"){
																download.status = 200;
																//downloadfile(unescape(parts[1]), dirname, title);
																break;
															}
															if(parts[0] == "35"){
																download.status = 200;
																//downloadfile(unescape(parts[1]), dirname, title);
																break;
															}
															if(parts[0] == "18"){
																download.status = 200;
																//downloadfile(unescape(parts[1]), dirname, title);
																break;
															}
															if(parts[0] == "34"){
																download.status = 200;
																//downloadfile(unescape(parts[1]), dirname, title);
																break;
															}
															if(parts[0] == "5"){
																download.status = 200;
																//downloadfile(unescape(parts[1]), dirname, title);
																break;
															}
*/
														}
													}
												}
												callback();
												break;
											default:
												break;
										}
									}
								}
							});
							break;
						default:
							break;
					}
				}
			}
		});
	}
	
	return function (req, res) {
		var purl = url.parse(req.url);
		var match = uidregex.exec(unescape(purl.search));
		var video_id = "";
		if (match != null && match.length > 1){
			qs = match[1];
			params = qs.split("&");
			for(param in params){
				parts = params[param].split("=");
				if(parts[0] == "v"){
					video_id = parts[1];
				}
			}
		}
		download.metaurl = "/oembed?url=" + escape("http://www.youtube.com/watch?v=" + video_id + "&format=json");
		download.vidurl = "/get_video_info?video_id=" + video_id + "&eurl=" + escape(myurl);
		loadResponseData(function () {
			var body = "<html><head></head><body>";
/*
			body += "<table>";
			body += "<tr><td>title</td><td>" + download.meta["title"] + "</td></tr>";
			body += "<tr><td>type</td><td>" + download.meta["type"] + "</td></tr>";
			body += "<tr><td>author</td><td>" + download.meta["author_name"] + "</td></tr>";
			body += "<tr><td>thumb</td><td><img width=\"" + download.meta["thumbnail_width"] + "\" height=\"" + download.meta["thumbnail_height"] + "\" src=\"" + download.meta["thumbnail_url"] + "\"></img></td></tr>";
			body += "</table>";
*/
			body += "<pre>";
			body += sys.inspect(download, true, 10);
			body += "<pre>";
			body += "</body></html>"
			res.writeHead(download.status,[
				["Content-Type" , "text/html" ],
				[ "Content-Length" , body.length ]
			]);
			res.write(body);
			res.end();
		});
	}
};

yuserv.staticHandler = function (filename) {
	var body, headers;
	var content_type = yuserv.mime.lookupExtension(extname(filename));
	var encoding = (content_type.slice(0,4) === "text" ? "utf8" : "binary");
	
	function loadResponseData(callback) {
		if (body && headers) {
			callback();
			return;
		}
		fs.readFile(filename, encoding, function(err, data) {
			body = data;
			headers = [ 
				[ "Content-Type" , content_type ],
				[ "Content-Length" , body.length ],
				[ "Cache-Control" , "public" ],
				["Accept-Ranges", "bytes" ]
			];
			callback();
		});
	}
 
	return function (req, res) {
		loadResponseData(function () {
			res.writeHead(200, headers);
			if(encoding=="binary"){
				res.write(body, encoding="binary");
			}
			else{
				res.write(body);
			}		
			res.end();
		});
	}
};
 
yuserv.vidHandler = function (filename) {
	var content_type = yuserv.mime.lookupExtension(extname(filename));
	var encoding = (content_type.slice(0,4) === "text" ? "utf8" : "binary");
	return function (req, res) {
						sys.puts(sys.inspect(req));
		fs.stat(filename, function(err, stats) {
			var headers = [ 
				[ "Content-Type" , content_type ],
				[ "Content-Length" , stats.size ],
				[ "Cache-Control" , "public" ],
				[ "X-Content-Duration" , "92.6" ],
				["Accept-Ranges", "bytes" ]
			];
			fs.open(filename, "r", 0666, function (err, fd) { 
				res.writeHead(200, headers);
				var totsize = 0; 
				function readChunk() 
				{ 
					fs.read(fd, 1024, totsize, encoding, function (err, chunk, bytes_read) { 
						if(chunk) { 
							totsize += bytes_read; 
							//sys.puts("send: " + totsize + " bytes"); 
							res.write(chunk, encoding); 
							process.nextTick(readChunk); 
						} 
						else { 
							sys.puts("file closed"); 
							res.end(); 
							fs.close(fd); 
						} 
					}); 
				} 
				readChunk(); 
			}); 
		});
	}
};

yuserv.mime = {
	lookupExtension : function(ext, fallback) {
		return yuserv.mime.TYPES[ext.toLowerCase()] || fallback || 'application/octet-stream';
	},

	TYPES : { 
		".3gp" : "video/3gpp"
		, ".a" : "application/octet-stream"
		, ".ai" : "application/postscript"
		, ".aif" : "audio/x-aiff"
		, ".aiff" : "audio/x-aiff"
		, ".asc" : "application/pgp-signature"
		, ".asf" : "video/x-ms-asf"
		, ".asm" : "text/x-asm"
		, ".asx" : "video/x-ms-asf"
		, ".atom" : "application/atom+xml"
		, ".au" : "audio/basic"
		, ".avi" : "video/x-msvideo"
		, ".bat" : "application/x-msdownload"
		, ".bin" : "application/octet-stream"
		, ".bmp" : "image/bmp"
		, ".bz2" : "application/x-bzip2"
		, ".c" : "text/x-c"
		, ".cab" : "application/vnd.ms-cab-compressed"
		, ".cc" : "text/x-c"
		, ".chm" : "application/vnd.ms-htmlhelp"
		, ".class" : "application/octet-stream"
		, ".com" : "application/x-msdownload"
		, ".conf" : "text/plain"
		, ".cpp" : "text/x-c"
		, ".crt" : "application/x-x509-ca-cert"
		, ".css" : "text/css"
		, ".csv" : "text/csv"
		, ".cxx" : "text/x-c"
		, ".deb" : "application/x-debian-package"
		, ".der" : "application/x-x509-ca-cert"
		, ".diff" : "text/x-diff"
		, ".djv" : "image/vnd.djvu"
		, ".djvu" : "image/vnd.djvu"
		, ".dll" : "application/x-msdownload"
		, ".dmg" : "application/octet-stream"
		, ".doc" : "application/msword"
		, ".dot" : "application/msword"
		, ".dtd" : "application/xml-dtd"
		, ".dvi" : "application/x-dvi"
		, ".ear" : "application/java-archive"
		, ".eml" : "message/rfc822"
		, ".eps" : "application/postscript"
		, ".exe" : "application/x-msdownload"
		, ".f" : "text/x-fortran"
		, ".f77" : "text/x-fortran"
		, ".f90" : "text/x-fortran"
		, ".flv" : "video/x-flv"
		, ".for" : "text/x-fortran"
		, ".gem" : "application/octet-stream"
		, ".gemspec" : "text/x-script.ruby"
		, ".gif" : "image/gif"
		, ".gz" : "application/x-gzip"
		, ".h" : "text/x-c"
		, ".hh" : "text/x-c"
		, ".htm" : "text/html"
		, ".html" : "text/html"
		, ".ico" : "image/vnd.microsoft.icon"
		, ".ics" : "text/calendar"
		, ".ifb" : "text/calendar"
		, ".iso" : "application/octet-stream"
		, ".jar" : "application/java-archive"
		, ".java" : "text/x-java-source"
		, ".jnlp" : "application/x-java-jnlp-file"
		, ".jpeg" : "image/jpeg"
		, ".jpg" : "image/jpeg"
		, ".js" : "text/javascript"
		, ".json" : "application/json"
		, ".log" : "text/plain"
		, ".m3u" : "audio/x-mpegurl"
		, ".m4v" : "video/mp4"
		, ".man" : "text/troff"
		, ".mathml" : "application/mathml+xml"
		, ".mbox" : "application/mbox"
		, ".mdoc" : "text/troff"
		, ".me" : "text/troff"
		, ".mid" : "audio/midi"
		, ".midi" : "audio/midi"
		, ".mime" : "message/rfc822"
		, ".mml" : "application/mathml+xml"
		, ".mng" : "video/x-mng"
		, ".mov" : "video/quicktime"
		, ".mp3" : "audio/mpeg"
		, ".mp4" : "video/mp4"
		, ".mp4v" : "video/mp4"
		, ".mpeg" : "video/mpeg"
		, ".mpg" : "video/mpeg"
		, ".ms" : "text/troff"
		, ".msi" : "application/x-msdownload"
		, ".odp" : "application/vnd.oasis.opendocument.presentation"
		, ".ods" : "application/vnd.oasis.opendocument.spreadsheet"
		, ".odt" : "application/vnd.oasis.opendocument.text"
		, ".ogg" : "application/ogg"
		, ".p" : "text/x-pascal"
		, ".pas" : "text/x-pascal"
		, ".pbm" : "image/x-portable-bitmap"
		, ".pdf" : "application/pdf"
		, ".pem" : "application/x-x509-ca-cert"
		, ".pgm" : "image/x-portable-graymap"
		, ".pgp" : "application/pgp-encrypted"
		, ".pkg" : "application/octet-stream"
		, ".pl" : "text/x-script.perl"
		, ".pm" : "text/x-script.perl-module"
		, ".png" : "image/png"
		, ".pnm" : "image/x-portable-anymap"
		, ".ppm" : "image/x-portable-pixmap"
		, ".pps" : "application/vnd.ms-powerpoint"
		, ".ppt" : "application/vnd.ms-powerpoint"
		, ".ps" : "application/postscript"
		, ".psd" : "image/vnd.adobe.photoshop"
		, ".py" : "text/x-script.python"
		, ".qt" : "video/quicktime"
		, ".ra" : "audio/x-pn-realaudio"
		, ".rake" : "text/x-script.ruby"
		, ".ram" : "audio/x-pn-realaudio"
		, ".rar" : "application/x-rar-compressed"
		, ".rb" : "text/x-script.ruby"
		, ".rdf" : "application/rdf+xml"
		, ".roff" : "text/troff"
		, ".rpm" : "application/x-redhat-package-manager"
		, ".rss" : "application/rss+xml"
		, ".rtf" : "application/rtf"
		, ".ru" : "text/x-script.ruby"
		, ".s" : "text/x-asm"
		, ".sgm" : "text/sgml"
		, ".sgml" : "text/sgml"
		, ".sh" : "application/x-sh"
		, ".sig" : "application/pgp-signature"
		, ".snd" : "audio/basic"
		, ".so" : "application/octet-stream"
		, ".svg" : "image/svg+xml"
		, ".svgz" : "image/svg+xml"
		, ".swf" : "application/x-shockwave-flash"
		, ".t" : "text/troff"
		, ".tar" : "application/x-tar"
		, ".tbz" : "application/x-bzip-compressed-tar"
		, ".tcl" : "application/x-tcl"
		, ".tex" : "application/x-tex"
		, ".texi" : "application/x-texinfo"
		, ".texinfo" : "application/x-texinfo"
		, ".text" : "text/plain"
		, ".tif" : "image/tiff"
		, ".tiff" : "image/tiff"
		, ".torrent" : "application/x-bittorrent"
		, ".tr" : "text/troff"
		, ".txt" : "text/plain"
		, ".vcf" : "text/x-vcard"
		, ".vcs" : "text/x-vcalendar"
		, ".vrml" : "model/vrml"
		, ".war" : "application/java-archive"
		, ".wav" : "audio/x-wav"
		, ".wma" : "audio/x-ms-wma"
		, ".wmv" : "video/x-ms-wmv"
		, ".wmx" : "video/x-ms-wmx"
		, ".wrl" : "model/vrml"
		, ".wsdl" : "application/wsdl+xml"
		, ".xbm" : "image/x-xbitmap"
		, ".xhtml" : "application/xhtml+xml"
		, ".xls" : "application/vnd.ms-excel"
		, ".xml" : "application/xml"
		, ".xpm" : "image/x-xpixmap"
		, ".xsl" : "application/xml"
		, ".xslt" : "application/xslt+xml"
		, ".yaml" : "text/yaml"
		, ".yml" : "text/yaml"
		, ".zip" : "application/zip"
	}
};
