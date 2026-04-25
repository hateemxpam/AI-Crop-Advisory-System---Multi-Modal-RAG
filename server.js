const app = require("./app");
const config = require("./config");

app.listen(config.port, () => {
	console.log(`[Server] AI Crop Advisory API listening on port ${config.port}`);
});
