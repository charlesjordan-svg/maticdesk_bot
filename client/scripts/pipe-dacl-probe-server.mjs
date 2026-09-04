// A Node named-pipe server created exactly the way NamedPipeBroker would: node:net, no options.
// The pipe name is built HERE so no backslashes cross a shell boundary - passing it as an argv
// through bash silently ate them on the first attempt and produced a bogus EACCES.
import net from "node:net";

const NAME = process.argv[2] || "matic-dacl-probe";
const PIPE = "\\\\.\\pipe\\" + NAME;

const srv = net.createServer((sock) => {
  sock.on("data", (d) => {
    console.log(`[server] received ${d.length} bytes: ${JSON.stringify(d.toString())}`);
    sock.write("ack\n");
  });
  sock.on("error", (e) => console.log(`[server] socket error: ${e.code}`));
});
srv.on("error", (e) => { console.log(`[server] LISTEN FAILED: ${e.code} ${e.message}`); process.exit(1); });
srv.listen(PIPE, () => {
  console.log(`[server] listening on ${PIPE}`);
  console.log(`[server] pid ${process.pid}`);
  console.log("READY");
});
process.on("SIGTERM", () => process.exit(0));
