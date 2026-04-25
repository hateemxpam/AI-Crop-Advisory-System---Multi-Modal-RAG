const express = require("express");
const queryRoutes = require("./routes/queryRoutes");

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
	res.status(200).json({ status: "ok" });
});

app.use("/api/query", queryRoutes);

app.use((_req, res) => {
	res.status(404).json({ success: false, error: "Route not found." });
});

module.exports = app;
