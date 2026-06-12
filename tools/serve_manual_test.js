import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const host = "127.0.0.1";
const port = 4173;
const testPage = path.resolve("test/manual/link-test.html");

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || "/", `http://${host}:${port}`).pathname;

  if (pathname !== "/" && pathname !== "/link-test.html") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  fs.createReadStream(testPage)
    .on("error", () => {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Could not read the manual test page.");
    })
    .once("open", () => {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
    })
    .pipe(response);
});

server.listen(port, host, () => {
  console.log(`Manual link test: http://${host}:${port}/`);
  console.log("Press Ctrl+C to stop.");
});
