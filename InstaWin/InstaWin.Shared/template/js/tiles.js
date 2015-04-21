(function (WAT) {
    "use strict";

    // Private method declaration
    var setupLiveTile, checkSiteforMetaData, processLiveTileMetaTags, setupTileFeed,
        setupPinning, pinHandler,
        logger = window.console;

    // Public API
    var self = {

        // These match the values in Windows.UI.Notifications.PeriodicUpdateRecurrence
        periodicUpdateRecurrence: [30, 60, 360, 720, 1440],

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            setupLiveTile();
            setupPinning();
        }

    };

    // Private methods

    setupLiveTile = function () {
        if (!WAT.config.livetile || WAT.config.livetile.enabled !== true) {
            return;
        }

        WAT.config.livetile.enableQueue = !!WAT.config.livetile.enableQueue;

        // Enable Notifications Queue - The tile will cycle through the multple tile notifications
        var notifications = Windows.UI.Notifications;
        notifications.TileUpdateManager.createTileUpdaterForApplication().enableNotificationQueue(WAT.config.livetile.enableQueue);

        if (WAT.config.livetile.tilePollFeed) {
            // Did they give us a feed to poll?

            setupTileFeed(WAT.config.livetile.tilePollFeed);

        } else {
            // If they didn't give us a specific feed, we'll see if the loaded 
            // webview has any live tile meta tags
            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", checkSiteforMetaData);
        }
    };

    checkSiteforMetaData = function () {
        var scriptString, exec;

        logger.log("looking for meta tags in webview...");

        WAT.options.webView.addEventListener("MSWebViewScriptNotify", processLiveTileMetaTags);

        scriptString = "var meta = document.querySelector('meta[name=msapplication-notification]');" +
                       "if (meta) { window.external.notify('TILEMETA~~' + meta.content); }";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();

        WAT.options.webView.removeEventListener("MSWebViewDOMContentLoaded", checkSiteforMetaData);

        /*
        META TAG EXAMPLE

        <meta name="application-name" content="Foobar"/>
        <meta name="msapplication-TileColor" content="#8f398f"/>
        <meta name="msapplication-square70x70logo" content="tiny.png"/>
        <meta name="msapplication-square150x150logo" content="square.png"/>
        <meta name="msapplication-wide310x150logo" content="wide.png"/>
        <meta name="msapplication-square310x310logo" content="large.png"/>
        <meta name="msapplication-notification" content="frequency=30;polling-uri=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=1;polling-uri2=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=2;polling-uri3=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=3;polling-uri4=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=4;polling-uri5=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=5; cycle=1"/>

        -OR-
        <meta name="application-name" content="Foobar"/>
        plus "browserconfig.xml":
        <browserconfig>
            <msapplication>
                <tile>
                    <square70x70logo src="tiny.png"/>
                    <square150x150logo src="square.png"/>
                    <wide310x150logo src="wide.png"/>
                    <square310x310logo src="large.png"/>
                    <TileColor>#8f398f</TileColor>
                </tile>
                <notification>
                    <polling-uri src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=1"/>
                    <polling-uri2 src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=2"/>
                    <polling-uri3 src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=3"/>
                    <polling-uri4 src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=4"/>
                    <polling-uri5 src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=5"/>
                    <frequency>30</frequency>
                    <cycle>1</cycle>
                </notification>
            </msapplication>
        </browserconfig>
        */
    };

    processLiveTileMetaTags = function (e) {
        var content, feedURL, recurrence;

        content = e.value.split(/~~/);
        if (content.length !== 2 || content[0] !== "TILEMETA") {
            // oops, this isn't ours
            return;
        }

        logger.log("captured script notify event for livetile polling feed: ", e.value);

        content = content[1].split(/;/);
        content.forEach(function (value) {
            var option = value.split(/=/);
            if (option[0] === "polling-uri") {
                feedURL = option[1];
            } else if (option[0] === "frequency" && WAT.config.livetile.periodicUpdate === undefined) {
                WAT.config.livetile.periodicUpdate = Math.max(0, self.periodicUpdateRecurrence.indexOf(option[1]));
            }
        });

        WAT.options.webView.removeEventListener("MSWebViewScriptNotify", processLiveTileMetaTags);

        setupTileFeed(feedURL);
    };

    setupTileFeed = function (feedURL) {
        var n, updater, address, urisToPoll,
            recurrence = Windows.UI.Notifications.PeriodicUpdateRecurrence.halfHour;

        if (feedURL.splice) {
            // we already have an array of feeds, use it!
            urisToPoll = feedURL;

        } else {
            urisToPoll = [];

            for (n = 0; n < 5; ++n) {
             //   address = "http://discourse.azurewebsites.net/FeedTile.ashx?index=" +
              //            String(n) +
                //           "&url=" + encodeURIComponent(feedURL);
                address = 'http://notifications.buildmypinnedsite.com/?feed=' + encodeURIComponent(feedURL)
                try {
                    urisToPoll.push(new Windows.Foundation.Uri(address));
                } catch (err) {
                    // broken address, never mind
                    logger.warn("Unable to load live tile feed URL: " + feedURL, err);
                    return;
                }
            }
        }

        try {
            updater = Windows.UI.Notifications.TileUpdateManager.createTileUpdaterForApplication();
            updater.clear();
            updater.stopPeriodicUpdate();

            if (WAT.config.livetile.periodicUpdate !== undefined) {
                recurrence = WAT.config.livetile.periodicUpdate;
            }

            updater.startPeriodicUpdateBatch(urisToPoll, recurrence);

        } catch (e) {
            // Tile APIs are flaky.. they sometimes fail for no readily apparent reason
            // but that's no reason to crash and risk a 1-star
            logger.warn("Error setting up live tile", e);
        }
    },

    setupPinning = function () {
        var btn,
            buttonText = "Pin this screen";

        if (!WAT.config.secondaryPin || WAT.config.secondaryPin.enabled !== true || !WAT.options.appBar) {
            return;
        }

        if (WAT.config.secondaryPin.buttonText) {
            buttonText = WAT.config.secondaryPin.buttonText;
        }

        var section = (WAT.config.secondaryPin.buttonSection || "global");

        btn = document.createElement("button");

        new WinJS.UI.AppBarCommand(btn, { label: buttonText, icon: "pin", section: section });

        btn.className = "win-disposable win-command win-global";
        btn.setAttribute("role", "menuitem");
        btn.setAttribute("id", "pinButton");
        btn.addEventListener("click", pinHandler);

        WAT.options.appBar.appendChild(btn);
    };

    pinHandler = function () {
        var secondaryTile, selectionRect, squareLogoUri, wideLogoUri, wideLogoPath,
            options = (Windows.UI.StartScreen.TileOptions.showNameOnLogo | Windows.UI.StartScreen.TileOptions.showNameOnWideLogo),
            displayName = WAT.options.webView.documentTitle,
            squareLogoPath = "/images/storelogo.scale-100.png";

        if (WAT.config.secondaryPin.squareImage) {
            squareLogoPath = ((/^\//.test(WAT.config.secondaryPin.squareImage)) ? "" : "/") + WAT.config.secondaryPin.squareImage;
        }
        squareLogoUri = new Windows.Foundation.Uri("ms-appx://" + squareLogoPath);

        if (WAT.config.secondaryPin.wideImage) {
            wideLogoPath = ((/^\//.test(WAT.config.secondaryPin.wideImage)) ? "" : "/") + WAT.config.secondaryPin.wideImage;
            wideLogoUri = new Windows.Foundation.Uri("ms-appx://" + wideLogoPath);
        }

        secondaryTile = new Windows.UI.StartScreen.SecondaryTile(
            "mainView.src",
            WAT.options.webView.documentTitle,
            displayName,
            WatExtensions.SuperCacheManager.resolveTargetUri(WAT.options.webView.src),
            options,
            squareLogoUri,
            wideLogoUri
        );

        if (WAT.config.secondaryPin.tileTextTheme === "light") {
            secondaryTile.visualElements.foregroundText = Windows.UI.StartScreen.ForegroundText.light;
        }
        if (WAT.config.secondaryPin.tileTextTheme === "dark") {
            secondaryTile.visualElements.foregroundText = Windows.UI.StartScreen.ForegroundText.dark;
        }

        selectionRect = document.getElementById("pinButton").getBoundingClientRect();

        secondaryTile.requestCreateForSelectionAsync(
            {
                x: selectionRect.left,
                y: selectionRect.top,
                width: selectionRect.width,
                height: selectionRect.height
            },
            Windows.UI.Popups.Placement.below
        );
    };


    // Module Registration
    WAT.registerModule("tiles", self);

})(window.WAT);