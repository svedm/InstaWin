// This script will be executed in the context of the webview
var foo = function () {
	console.log("Injection successful");
};

foo();

$(document).ready(function () {
	console.log("ready!");
	if (document.location.pathname !== "/") {
		//on register page
	} else {
		//on main page
		console.log("fuck");
	}
});