const app = require("./app");
const config = require("./config");

function startServer(port, retriesLeft = 10) {
	const server = app.listen(port, () => {
		console.log(`[Server] AI Crop Advisory API listening on port ${port}`);
	});

	server.on("error", (error) => {
		if (error.code === "EADDRINUSE" && retriesLeft > 0) {
			const nextPort = port + 1;
			console.warn(`[Server] Port ${port} is in use. Retrying on port ${nextPort}...`);
			server.close(() => startServer(nextPort, retriesLeft - 1));
			return;
		}

		console.error(`[Server] Failed to start on port ${port}:`, error.message);
		process.exit(1);
	});
}

startServer(config.port);
