function ok(res, data) {
	return res.status(200).json({ success: true, data });
}

function badRequest(res, error) {
	return res.status(400).json({ success: false, error });
}

function internalError(res, error, details) {
	return res.status(500).json({
		success: false,
		error,
		details,
	});
}

module.exports = {
	ok,
	badRequest,
	internalError,
};
