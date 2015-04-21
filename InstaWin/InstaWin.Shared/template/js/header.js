﻿(function (WAT) {
    "use strict";

    // Private method declaration
    var setupHeader, setPageTitle,
        logger = window.console;

    // Public API
    var self = {

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            setupHeader();
        },

        setPageTitle: function (home) {

            if (!WAT.config.header || !WAT.config.header.title || !WAT.config.header.title.enabled || WAT.config.header.title.enabled !== true)
                return;

            if (WAT.config.header.title.displayOnHomePage === false) {
                if (home) {
                    WAT.options.title.innerHTML = "";
                    WAT.options.title.hidden = true;
                    WAT.options.logo.hidden = false;
                    return;
                }
            }

            var title = WAT.options.webView.documentTitle;

            var start = title.indexOf(" | ");
            var stop = title.indexOf(" | ", start + 1);

            if (start == -1) {
                start == 0;
                stop = title.length;
            }
            else {
                if (start != -1 && stop == -1) {
                    stop = start;
                    start = 0;
                }
                else {
                    start = start + 3;
                }
            }

            title = title.substring(start, stop);

            WAT.options.title.innerHTML = "<span class='pagetitle'>" + title + "</span>";
            WAT.options.title.hidden = false;
            WAT.options.logo.hidden = true;
        }

    };

    setupHeader = function () {
        if (!WAT.config.header || WAT.config.header.enabled !== true) {
            WAT.options.header.style.background = "transparent";
            WAT.options.stage.style.msGridRow = 1;
            WAT.options.stage.style.msGridRowSpan = 2;
        }
        else {
            if (WAT.config.header.backgroundColor) {
                WAT.options.header.style.background = WAT.config.header.backgroundColor;
            }

            if (WAT.environment.isWindowsPhone && WAT.config.navBar.enabled && WAT.config.header.navDrawerBackgroundColor) {
                WAT.options.navDrawer.style.background = WAT.config.header.navDrawerBackgroundColor;
                document.getElementById("navDrawerIconTextItem").style.background = WAT.config.header.navDrawerBackgroundColor;
            }

            if (WAT.config.header.logo) {
                WAT.options.logo.src = WAT.config.header.logo;
            }

        }
    };

    // Module Registration
    WAT.registerModule("header", self);

})(window.WAT);