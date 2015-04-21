(function (WAT) {
    "use strict";

    // Private method declaration
    var setupShare, addShareButton, shareClickHandler, handleShareRequest, getScreenshot, processScreenshot, sharePage, makeLink,
        logger = window.console;

    // Public API
    var self = {

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            setupShare();
        }

    };

    // Private methods

    setupShare = function () {
        var dataTransferManager;

        if (!WAT.config.share || WAT.config.share.enabled !== true) {
            return;
        }
        
        dataTransferManager = Windows.ApplicationModel.DataTransfer.DataTransferManager.getForCurrentView();
        dataTransferManager.addEventListener("datarequested", handleShareRequest);

        if (WAT.config.share.showButton) {
            addShareButton();
        }
    };

    addShareButton = function ()
    {
        var btn,
            buttonText = (WAT.config.share.buttonText | "Share");

        if (!WAT.options.appBar)
        {
            return;
        }

        if (WAT.config.share.buttonText)
        {
            buttonText = WAT.config.share.buttonText;
        }

        var section = (WAT.config.share.buttonSection || "global");

        btn = document.createElement("button");
        btn.setAttribute("style", "-ms-high-contrast-adjust:none");
        btn.addEventListener("click", shareClickHandler);

        new WinJS.UI.AppBarCommand(btn, { id: 'shareButton', label: buttonText, icon: 'url(/images/share.png)', section: section });

        WAT.options.appBar.appendChild(btn);
    };

    shareClickHandler = function ()
    {
        Windows.ApplicationModel.DataTransfer.DataTransferManager.showShareUI();
    };

    handleShareRequest = function (e) {
        var deferral = e.request.getDeferral();
        
        if (WAT.config.share.screenshot) {
            getScreenshot().then(
                function (imageFile) {
                    sharePage(e.request, deferral, imageFile);
                },
                function (err) {
                    // There was an error capturing, but we still want to share
                    logger.warn("Error capturing screenshot, sharing anyway", err);
                    sharePage(e.request, deferral, null);
                }
            );
        } else {
            sharePage(e.request, deferral, null);
        }
    };

    getScreenshot = function () {
        var screenshotFile;

        return new WinJS.Promise(function (complete, error) {

            if (!WAT.options.webView.capturePreviewToBlobAsync) {
                // screen capturing not available, but we still want to share...
                error(new Error("The capturing method (capturePreviewToBlobAsync) does not exist on the webview element"));
                return;
            }

            // we create the screenshot file first...
            Windows.Storage.ApplicationData.current.temporaryFolder.createFileAsync("screenshot.png", Windows.Storage.CreationCollisionOption.replaceExisting)
                .then(
                    function (file) {
                        // open the file for reading...
                        screenshotFile = file;
                        return file.openAsync(Windows.Storage.FileAccessMode.readWrite);
                    },
                    error
                )
                .then(processScreenshot, error)
                .then(
                    function () {
                        complete(screenshotFile);
                    },
                    error
                );
        });
    };

    processScreenshot = function (fileStream) {
        return new WinJS.Promise(function (complete, error) {
            var captureOperation = WAT.options.webView.capturePreviewToBlobAsync();

            captureOperation.addEventListener("complete", function (e) {
                var inputStream = e.target.result.msDetachStream();

                Windows.Storage.Streams.RandomAccessStream.copyAsync(inputStream, fileStream).then(
                    function () {
                        fileStream.flushAsync().done(
                            function () {
                                inputStream.close();
                                fileStream.close();
                                complete();
                            }
                        );
                    }
                );
            });

            captureOperation.start();
        });
    };

    makeLink = function (url, content)
    {
        if (content) {
            return "<a href=\"" + url + "\">" + content + "</a>";
        }
        else {
            return "<a href=\"" + url + "\">" + url + "</a>";
        }
    }

    sharePage = function (dataReq, deferral, imageFile) {
        var msg = WAT.config.share.message,
            shareUrl = WatExtensions.SuperCacheManager.resolveTargetUri(WAT.options.webView.src),
            currentURL = WAT.config.share.url.replace("{currentURL}", shareUrl),
            html = WAT.config.share.message;

        var displayName = (WAT.config.displayName || "");
        var currentApp = Windows.ApplicationModel.Store.CurrentApp;
        var appUri;
        if (currentApp.appId != "00000000-0000-0000-0000-000000000000")
            appUri = currentApp.linkUri.absoluteUri;
        else
            appUri = "Unplublished App, no Store link is available";

        msg = msg.replace("{url}", WAT.config.share.url).replace("{currentURL}", shareUrl).replace("{appUrl}", appUri).replace("{appLink}", displayName);
        html = html.replace("{currentUrl}", makeLink(WAT.config.share.url)).replace("{url}", makeLink(shareUrl)).replace("{appUrl}", makeLink(appUri)).replace("{appLink}", makeLink(appUri, displayName));

        var htmlFormat = Windows.ApplicationModel.DataTransfer.HtmlFormatHelper.createHtmlFormat(html);

        dataReq.data.properties.title = WAT.config.share.title;

        dataReq.data.setText(msg);

        // TODO: Windows Phone is having problems processing HTML during a share right now - JB - 2014-05-15
        if (!WAT.environment.isWindowsPhone) {
            dataReq.data.setHtmlFormat(htmlFormat);
        }

        // Not doing this as it always includes a link which may not be what 
        // the user desired. - JB - 2014-05-15
        // dataReq.data.setWebLink(new Windows.Foundation.Uri(currentURL));

        if (imageFile) {
            dataReq.data.setStorageItems([imageFile], true);
        }

        deferral.complete();
    };


    
    // Module Registration
    WAT.registerModule("share", self);

})(window.WAT);