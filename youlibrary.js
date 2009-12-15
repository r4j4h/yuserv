var fu = require('./fu');
var http = require('http');
var posix = require('posix');
var sys = require('sys');
var file = require('file');

fu.playerHandler = function (filename) {
	return function (req, res) {
		body = "<html><head>";
		body += "<script type=\"text/javascript\" src=\"/flowplayer.js\"></script>";
		body += "<link rel=\"stylesheet\" type=\"text/css\" href=\"/style.css\">";
		body += "</head><body><table>";
		body += "<tr><td>";
		body += "<a href=\"" + unescape(filename) + "\" style=\"display:block;width:520px;height:330px\" id=\"player\"></a>";
		body += "<script>flowplayer(\"player\", \"/flowplayer.swf\");</script>";
		body += "</td></tr>";
		body += "</table></body></html>";
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

fu.dirHandler = function (dirname) {
	var body, headers;
	
	function loadResponseData(callback) {
		if (body && headers && !DEBUG) {
			callback();
			return;
		}
		
		var promise = posix.readdir(dirname);
	
		promise.addCallback(function (files) {
			body = "<html><head>";
			body += "<link rel=\"stylesheet\" type=\"text/css\" href=\"/style.css\">";
			body += "</head><body><div id=\"page\"><h1>BookMarklet</h1><a href=\"javascript:location='http://" + fuip + ":" + fuport + "/download/?url='+escape(location) \">Youtube-dl</a><h1>Videos</h1>";
		
			for (file in files){
				body += "<p><a href=\"/vids/" + files[file] + ".html\">" + files[file] + "</a></p>";
				fu.get("/vids/" + files[file] + ".html", fu.playerHandler("/vids/" + files[file]));
				fu.get("/vids/" + files[file], fu.staticHandler(dirname + "/" + files[file]));
			}
			body += "</div></body></html>";
			headers = 
				[ 
					[ "Content-Type" , "text/html" ],
					[ "Content-Length" , body.length ]
				];
			if (!DEBUG)
			headers.push(["Cache-Control", "public"]);
		
			sys.puts("dir " + dirname + " loaded");
			callback();
		});
	
		promise.addErrback(function () {
			sys.puts("Error loading dir: " + dirname);
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

fu.downloadHandler = function (dirname) {
	var body, status, headers, metaurl, vidurl;
	
	function loadResponseData(callback) {
		sys.puts("META: " + metaurl);
		sys.puts("VID: " + vidurl);
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
												sys.puts(unescape(parts[1]));
												downloadfile(unescape(parts[1]), dirname, title);
												break;
											}
											if(parts[0] == "35"){
												status = 200;
												sys.puts(unescape(parts[1]));
												downloadfile(unescape(parts[1]), dirname, title);
												break;
											}
											if(parts[0] == "5"){
												status = 200;
												sys.puts(unescape(parts[1]));
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
		var myregexp = new RegExp("http://www\\.youtube\\.com/watch\\??([-A-Za-z0-9+&@#/%=~_|!:,.;]*)?");
		var match = myregexp.exec(unescape(req.uri.queryString));
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

function downloadfile(url, vdir, title)
{
	var myregexp = new RegExp("[^\\w]", "g");
	var safetitle = title.replace(myregexp, "_");
	var fn = vdir + "/" + safetitle + ".flv";

	var myregexp = new RegExp("(https?|ftp)://([-A-Z0-9.]+)(/[-A-Z0-9+&@#/%=~_|!:,.;]*)?(\\?[-A-Z0-9+&@#/%=~_|!:,.;]*)?", "i");
	var match = myregexp.exec(url);
	if (match != null && match.length > 1) {
		var host = match[2];
		sys.puts("downloading " + url + " to " + fn);
		var fd = new file.File(fn, 'w+', {encoding: 'binary'});
		var vclient = http.createClient(80, host);
		var vrequest = vclient.get(url, {"host": host, "Connection": "close", "User-Agent": "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; .NET CLR 2.0.50727; .NET CLR 1.1.4322; .NET CLR 3.0.4506.2152; .NET CLR 3.5.30729)"});
		vrequest.finish(function (res) {
			res.addListener('body', function(chunk) {
				fd.write(chunk);
			});
			res.addListener('complete', function() {
				fu.get("/vids/" + safetitle + ".html", fu.playerHandler("/vids/" + safetitle));
				fu.get("/vids/" + safetitle, fu.staticHandler(fn));
				sys.puts(fn + " download complete!");
				fd.close();
			});
		});
	}
}

var fuip = "192.168.2.191";
var fuport = 8000;
var fufilesdir = "../vids";
// change to some sort of unique identifier for yourself. google throttles based on this as far as i can tell.
var myurl = "http://www.google.com/";

fu.listen(fuport, fuip);
fu.get("/style.css", fu.staticHandler("style.css"));
fu.get("/flowplayer.js", fu.staticHandler("flowplayer.js"));
fu.get("/flowplayer.swf", fu.staticHandler("flowplayer.swf"));
fu.get("/flowplayer.controls.swf", fu.staticHandler("flowplayer.controls.swf"));
fu.get("/", fu.dirHandler(fufilesdir));
fu.get("/download/", fu.downloadHandler(fufilesdir));
