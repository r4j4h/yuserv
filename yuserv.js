var createServer = require("http").createServer;
var sys = require("sys");
var posix = require("posix");
var http = require('http');
var file = require('file');

var yuserv = exports;
 
var NOT_FOUND = "Not Found\n";
var fuip = "127.0.0.1";
var fuport = 8000;
var fufilesdir = "../vids";
var myurl = "http://www.google.com/";
var urlregex = new RegExp("(https?|ftp)://([-A-Z0-9.]+)(/[-A-Z0-9+&@#/%=~_|!:,.;]*)?(\\?[-A-Z0-9+&@#/%=~_|!:,.;]*)?", "i");
var uidregex = new RegExp("http://www\\.youtube\\.com/watch\\??([-A-Za-z0-9+&@#/%=~_|!:,.;]*)?");

function downloadfile(url, vdir, title)
{
	var myregexp = new RegExp("[^\\w]", "g");
	var safetitle = title.replace(myregexp, "_");
	var fn = vdir + "/" + safetitle + ".flv";

	var match = urlregex.exec(url);
	if (match != null && match.length > 1) {
		var host = match[2];
		var fd = new file.File(fn, 'w+', {encoding: 'binary'});
		var client = http.createClient(80, host);
		var request = client.get(url, {"host": host, "Connection": "close", "User-Agent": "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; .NET CLR 2.0.50727; .NET CLR 1.1.4322; .NET CLR 3.0.4506.2152; .NET CLR 3.5.30729)"});
		request.finish(function (res) {
			res.addListener('body', function(chunk) {
				fd.write(chunk);
			});
			res.addListener('complete', function() {
				yuserv.get("/vids/" + safetitle + ".html", yuserv.playerHandler("/vids/" + safetitle));
				yuserv.get("/vids/" + safetitle, yuserv.staticHandler(fn));
				fd.close();
			});
		});
	}
}
 
function notFound(req, res) {
	res.sendHeader(404, [["Content-Type", "text/plain"],["Content-Length", NOT_FOUND.length]]);
	res.sendBody(NOT_FOUND);
	res.finish();
}
 
var getMap = {};
 
yuserv.get = function (path, handler) {
	getMap[path] = handler;
};
 
var server = createServer(function (req, res) {
	if (req.method === "GET" || req.method === "HEAD") {
		var handler = getMap[unescape(req.uri.path)] || notFound;
		handler(req, res);
	}
});
 
yuserv.listen = function (port, host) {
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
		body += "<script type=\"text/javascript\" src=\"/flowplayer.js\"></script>";
		body += "<link rel=\"stylesheet\" type=\"text/css\" href=\"/style.css\">";
		body += "</head><body><div id=\"page\">";
		body += "<p>";
		body += "<a href=\"" + unescape(filename) + "\" style=\"display:block;width:520px;height:330px\" id=\"player\"></a>";
		body += "<script>flowplayer(\"player\", \"/flowplayer.swf\");</script>";
		body += "</p>";
		body += "</div></body></html>";
		headers = 
		[ 
			[ "Content-Type" , "text/html" ],
			[ "Content-Length" , body.length ]
		];
		res.sendHeader(200, headers);
		res.sendBody(body);
		res.finish();
	}
};

yuserv.dirHandler = function (dirname) {
	var body, headers;
	
	function loadResponseData(callback) {
		if (body && headers) {
			callback();
			return;
		}
		
		var promise = posix.readdir(dirname);
	
		promise.addCallback(function (files) {
			body = "<html><head>";
			body += "<link rel=\"stylesheet\" type=\"text/css\" href=\"/style.css\">";
			body += "</head><body><div id=\"page\"><h1>BookMarklet</h1><p><a href=\"javascript:location='http://" + fuip + ":" + fuport + "/download/?url='+escape(location) \">Youtube-dl</a></p><h1>Videos</h1>";
		
			for (file in files){
				body += "<p><a href=\"/vids/" + files[file] + ".html\">" + files[file] + "</a></p>";
				yuserv.get("/vids/" + files[file] + ".html", yuserv.playerHandler("/vids/" + files[file]));
				yuserv.get("/vids/" + files[file], yuserv.staticHandler(dirname + "/" + files[file]));
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
	
		promise.addErrback(function () {
		});
	}
	
	return function (req, res) {
		loadResponseData(function () {
			res.sendHeader(200, headers);
			res.sendBody(body);
			res.finish();
		});
	}
};

yuserv.downloadHandler = function (dirname) {
	var body, status, headers, metaurl, vidurl;
	
	function loadResponseData(callback) {
		status = 400;

		var client = http.createClient(80, "www.youtube.com");
		var request = client.get(metaurl, {"host": "www.youtube.com", "Connection": "keep-alive"});

		request.finish(function (res) {
			var response = "";
			switch(res.statusCode)
			{
				case 200:
					res.addListener('body', function(chunk) {
						response+=chunk;
					});
					res.addListener('complete', function() {
						body = response;
						meta = JSON.parse(response);
						title = meta["title"];
						var vrequest = client.get(vidurl, {"host": "www.youtube.com", "Connection": "keep-alive"});
						vrequest.finish(function (res) {
							var response = "";
							switch(res.statusCode){
								case 200:
									break;
								default:
							}
							res.addListener('body', function(chunk) {
								response+=chunk;
							});
							res.addListener('complete', function() {
								lines = response.split("&");
								for(line in lines){
									parts = lines[line].split("=");
									if(parts[0] == "fmt_url_map"){
										map = parts[1];
										urls = map.split("%2C");
										for(url in urls){
											parts = urls[url].split("%7C");
											if(parts[0] == "34"){
												status = 200;
												downloadfile(unescape(parts[1]), dirname, title);
												break;
											}
											if(parts[0] == "35"){
												status = 200;
												downloadfile(unescape(parts[1]), dirname, title);
												break;
											}
											if(parts[0] == "5"){
												status = 200;
												downloadfile(unescape(parts[1]), dirname, title);
												break;
											}
										}
									}
								}
								headers = 
								[ 
									[ "Content-Type" , "text/html" ],
									[ "Content-Length" , body.length ]
								];
								callback();
							});
						});
					});
					break;
				default:
			}
		});
	}
	
	return function (req, res) {
		var match = uidregex.exec(unescape(req.uri.queryString));
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
		metaurl = "/oembed?url=" + escape("http://www.youtube.com/watch?v=" + video_id + "&format=json");
		vidurl = "/get_video_info?video_id=" + video_id + "&eurl=" + escape(myurl);
		
		loadResponseData(function () {
			res.sendHeader(status, headers);
			res.sendBody(body);
			res.finish();
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
	    var promise = posix.cat(filename, encoding);
		promise.addCallback(function (data) {
			body = data;
			headers = [ 
				[ "Content-Type" , content_type ],
				[ "Content-Length" , body.length ],
				[ "Cache-Control" , "public" ],
				["Accept-Ranges", "bytes" ]
			];
			callback();
		});
 
		promise.addErrback(function () {
		});
	}
 
	return function (req, res) {
		loadResponseData(function () {
			res.sendHeader(200, headers);
			if(encoding=="binary"){
				res.sendBody(body, encoding="binary");
			}
			else{
				res.sendBody(body);
			}		
			res.finish();
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
