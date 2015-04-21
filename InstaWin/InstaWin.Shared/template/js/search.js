(function (WAT) {
    "use strict";

    // Private method declaration
    var setupSearchCharm, handleSearchQuery, setupOnScreenSearch,
        logger = window.console;

    // Public API
    var self = {

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            if (!WAT.config.search || WAT.config.search.enabled !== true || !WAT.config.search.searchURL) {
                if (WAT.environment.isWindowsPhone) { // disabling navDrawer search
                    document.getElementById("search-box").style.display = "none";
                }
                return;
            }

            if (WAT.environment.isWindows) {
            if (WAT.config.search.useOnScreenSearchBox === true) {
                setupOnScreenSearch();
            } else {
                setupSearchCharm();
            }
        }
            else if (WAT.environment.isWindowsPhone) { 
                WAT.options.searchBox.addEventListener("keypress", handleSearchQuery);
                WAT.options.searchBox.placeholder = (WAT.config.search.onScreenSearchOptions.placeholderText || "Search");
            }
        }

    };

    setupSearchCharm = function () {
        try {
            if (Windows.ApplicationModel.Search.SearchPane.getForCurrentView()) {
                Windows.ApplicationModel.Search.SearchPane.getForCurrentView().onquerysubmitted = handleSearchQuery;
            }
        } catch (err) {
            // let's not crash the app for this...
            logger.error("Error initializing search charm:", err);
        }
    };

    setupOnScreenSearch = function () {
        var searchPlaceholder = WinJS.Resources.getString("searchPlaceholder");
        var searchOptions = (WAT.config.search.onScreenSearchOptions || {}),
            searchBox = new WinJS.UI.SearchBox(WAT.options.searchBox, {
                chooseSuggestionOnEnter: (searchOptions.chooseSuggestionOnEnter !== false), // default to true
                focusOnKeyboardInput: !!searchOptions.focusOnKeyboardInput, // default to false
                placeholderText: (searchOptions.placeholderText || searchPlaceholder.value),
                searchHistoryDisabled: !!searchOptions.searchHistoryDisabled, // default to false
                searchHistoryContext: "wat-app-search", // static
                disabled: false
            });

        WAT.options.searchBox.style.display = "block";
        WAT.options.searchBox.addEventListener("querysubmitted", handleSearchQuery);

        //WinJS.UI.processAll().done(function () {
        //    WAT.options.searchBox.addEventListener("querysubmitted", handleSearchQuery);
        //});
    };


    handleSearchQuery = function (e) {

        if (WAT.environment.isWindows) {
        var query = e.queryText;

        if (e.detail.queryText) {
            query = e.detail.queryText;
        }
        }
        else if (WAT.environment.isWindowsPhone) {
            var query = e.target.value;
        }

        var searchUrl = WAT.config.search.searchURL;
        WAT.goToLocation(searchUrl.replace("{searchTerm}", query));
    };

    // Module Registration
    WAT.registerModule("search", self);

})(window.WAT);