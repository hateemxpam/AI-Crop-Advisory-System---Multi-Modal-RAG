function isNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

function isValidLanguage(value) {
	return ["en", "ur", "pa"].includes(value);
}

module.exports = {
	isNonEmptyString,
	isValidLanguage,
};
