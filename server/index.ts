import { config } from "./config";
import { startWebChessServer } from "./app";

void startWebChessServer(config.host, config.port).then((startedServer) => {
  console.log(
    `Web Chess server listening on http://${startedServer.host}:${startedServer.port}`
  );
});
