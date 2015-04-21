(function (WAT) {
    "use strict";

    var init,
        subscriptionChanged,
        notify,
        flyoutUrl = "/template/notify-settings.html",
        logger = window.console;

    if (!WAT) {
        // This would be bad...
        logger.error("The WAT namespace is not defined!");
        return;
    }

    if (WAT.getModule("log")) {
        logger = WAT.getModule("log");
    }

    notify = WAT.getModule("notify");
    if (!notify) {
        logger.error("Unable to find notify module");
        return;
    }

    init = function (element, options) {
        var i, l,
            templateElement = document.getElementById("notifySettingsTemplate"),
            renderElement = document.getElementById("notifySettingsTemplateControlRenderTarget"),
            templateControl = templateElement.winControl;

        // reset inner content
        renderElement.innerHTML = "";
            
        for (i = 0, l = notify.tagSubs.length; i < l; ++i) {
            templateControl.render(notify.tagSubs[i], renderElement).then(
                function completed(result) {
                    // Get a handle to newly rendered toggle switch inside the template
                    var e = renderElement.children[i].children[0];

                    // Need to set id attribute here, wouldn't render in data-win-bind for some reason
                    e.setAttribute("id", notify.tagSubs[i].id);

                    // Add changed event handler
                    e.winControl.addEventListener('change', subscriptionChanged, false);
                }
            );
        }

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

    subscriptionChanged = function (event) {
        var target = event.target.winControl;
        logger.log("Changed:" + target.title + " - status: " + (target.checked ? "on" : "off"));

        // Update setting model & subscription
        notify.updateSubscription(event.target.id, target.checked);
    };

    // Set up the page and handlers
    WinJS.UI.Pages.define(flyoutUrl, { ready: init });

})(window.WAT);
