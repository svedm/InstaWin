(function (WAT) {
    "use strict";

    var flyoutUrl = "/template/roller-settings.html", init, updateFile, refreshApp, removeSavedHostURL;

    init = function () {
        var navbutton = document.getElementById('navbutton');
        var refreshbutton = document.getElementById('refreshbutton');
        var clearbutton = document.getElementById('clearbutton');

        navbutton.addEventListener('pointerdown', function () {
            updateFile();
            refreshApp();
        });

        refreshbutton.addEventListener('pointerdown', function () {
            refreshApp();
        });

        clearbutton.addEventListener('pointerdown', function () {
            removeSavedHostURL();
            refreshApp();
        });

        if (!WAT.environment.isWindowsPhone) {
            var header = document.querySelector('.win-header');
            if (header) {
                if (WAT.styles.manifestBackgroundColor) {
                    header.style.backgroundColor = WAT.styles.manifestBackgroundColor;
                    if (WAT.styles.manifestForegroundText) {
                        WinJS.Utilities.addClass(header, WAT.styles.manifestForegroundText === "light" ? "win-ui-dark" : "win-ui-light");
                    }
                }

                var logo = header.querySelector(".flyout-logo");
                if (logo) {
                    logo.style.display = "inline";
                }
            }
        }

        WinJS.Resources.processAll();
    };

    refreshApp = function () {
        window.navigate('wat-wrapper.html');
    };

    updateFile = function () {
        var hostURL = document.getElementById('hostURL');
        localStorage.setItem("savedHostURL", hostURL.value);
    };

    removeSavedHostURL = function () {
        localStorage.removeItem("savedHostURL");
    };


    // Set up the page and handlers
    WinJS.UI.Pages.define(flyoutUrl, { ready: init });

})(window.WAT);
