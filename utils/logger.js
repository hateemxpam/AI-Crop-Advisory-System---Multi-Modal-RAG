function timestamp() {
	return new Date().toISOString();
}

function info(message) {
	console.log(`[${timestamp()}] INFO: ${message}`);
}

function error(message, details = "") {
	console.error(`[${timestamp()}] ERROR: ${message}`, details);
}

module.exports = {
	info,
	error,
};
