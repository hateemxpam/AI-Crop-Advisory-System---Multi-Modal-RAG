const express = require("express");
const path = require("path");
const queryRoutes = require("./routes/queryRoutes");

const app = express();
const publicDir = path.join(__dirname, "public");

app.use(express.json());
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
	res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/health", (_req, res) => {
	res.status(200).json({ status: "ok" });
});

app.use("/api/query", queryRoutes);

app.use((_req, res) => {
	res.status(404).json({ success: false, error: "Route not found." });
});

module.exports = app;
