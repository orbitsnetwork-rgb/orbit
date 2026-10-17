import * as L from "./lib.mjs";
await L.startServer({}, {fresh:false});
const h = await (await fetch(L.BASE + "/l/" + process.argv[2])).text();
console.log(h.match(/<meta[^>]*og:[^>]*>|<title>[^<]*<\/title>/g));
await L.stopServer();
