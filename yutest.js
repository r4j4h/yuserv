var yuserv = require('./yuserv');

fuip = "0.0.0.0";
fuport = parseInt(process.ARGV[2]);
fufilesdir = process.ARGV[3];

yuserv.get("/style.css", yuserv.staticHandler("style.css"));
yuserv.get("/flowplayer.js", yuserv.staticHandler("flowplayer.js"));
yuserv.get("/flowplayer.swf", yuserv.staticHandler("flowplayer.swf"));
yuserv.get("/flowplayer.controls.swf", yuserv.staticHandler("flowplayer.controls.swf"));
yuserv.get("/", yuserv.dirHandler(fufilesdir));
yuserv.get("/download/", yuserv.downloadHandler(fufilesdir));

yuserv.listen(fuport, fuip);

