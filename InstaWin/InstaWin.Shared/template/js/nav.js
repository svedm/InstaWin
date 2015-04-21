var navDrawerList = new WinJS.Binding.List();

(function (WAT, WinJS, Windows) {
    "use strict";

    // "icon" values are set to a value that mataches an icon name, 
    // the whole list of which are at the link below:
    // http://msdn.microsoft.com/en-us/library/windows/apps/hh770557.aspx

    // Private method & variable declarations
    var configureBackButton, webViewLoaded, webViewNavStart, webViewNavComplete, navigateBack, dialogViewNavigationStarting,
        setupLoadingContent, loadingPartialFileLoadHandler,
        setupAppBar, setupNavBar, createNavBarButton, setButtonAction, initUIDeclarations, setStickyBits,
        injectNavbarBuildingQuery, processWebviewNavLinks, setupNestedNav, toggleNestedNav,
        handleBarEval, handleBarNavigate, handleBarSettings, handleBarShare,
        setupExtendedSplashScreen, updateSplashPositioning, updateExtendedSplashScreenStyles,
	    configureRedirects, addRedirectRule, processOldRedirectFormat,
        redirectShowMessage, redirectPopout, redirectUrl,
        loadWindowOpenSpy, loadWindowCloseSpy, handleWindowOpen, handleWindowClose, closeModalContent, 
        splashScreenEl, splashScreenImageEl, splashLoadingEl, getUriParameter,
        navDrawerInit, returnToContent, toggleMenu, itemInvokedHandler, disableNavDrawer,
        afterProcessAllActions = [],
        logger = window.console,
        barActions = {},
        splashScreen = null,
        backButtons = [],
        backButtonRules = [],
        redirectRules = [],
        redirectActions = {},
        contentLoaded = false;

    var _menuWidth = 300;

    // Public API
    var self = {

        start: function () {
            WAT.config.navigation = (WAT.config.navigation || {});

            if (WAT.environment.isWindows) {
                WAT.config.navigation.hideOnPageBackButton = !!WAT.config.navigation.hideOnPageBackButton;
            }
            else {
                // If we are on Windows Phone we have a hardware backbutton so we always hide the onscreen one
                WAT.config.navigation.hideOnPageBackButton = true;
            }

            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            configureBackButton();
            configureRedirects();

            setupLoadingContent();

            // when inner pages load, do these things...
            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", webViewLoaded);
            // when inner navigation occurs, do some stuff
            WAT.options.webView.addEventListener("MSWebViewNavigationStarting", webViewNavStart);
            // when navigation is complete, remove the loading icon
            WAT.options.webView.addEventListener("MSWebViewNavigationCompleted", webViewNavComplete);

            barActions = {
                back: navigateBack,
                eval: handleBarEval,
                navigate: handleBarNavigate,
                settings: handleBarSettings,
                share: handleBarShare,
                nested: true
            };
            setupAppBar();
            setupNavBar();

            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", setStickyBits);
        },

        toggleBackButton: function (isVisible) {
            var state,
                showBackButton = false;

            if (backButtons && backButtons.length) {
                // all back buttons should be in sync, so only toggle on first button's state
                state = backButtons[0].style.display;

                showBackButton = (isVisible === true || (isVisible === undefined && state === "none"));

                backButtons.forEach(function (btn) {
                    if (btn.id === "backbutton-wrapper") {
                        // on-page button (hidden vs disabled)
                        btn.style.display = (showBackButton && !WAT.config.navigation.hideOnPageBackButton) ? "block" : "none";
                    } else if (showBackButton) {
                        btn.classList.remove("disabled");
                    } else {
                        btn.classList.add("disabled");
                    }
                });
            }
        },

        toggleLoadingScreen: function (isLoading) {
            var clearOverlay = document.querySelector(".transparent-overlay");
            var blurOverlay = document.querySelector(".webview-overlay");

            if (isLoading) {
                if (blurOverlay && clearOverlay) {
                    if (WAT.environment.isWindowsPhone) {
                        if (!self.contentLoaded) {
                            clearOverlay.style.display = 'inline';
                            blurOverlay.classList.remove("fadeOut");
                            if (!clearOverlay.classList.contains("overlay-wp")) {
                                clearOverlay.classList.add("overlay-wp");
                            }
                        }
                    }
                    else {
                        // use base64 encoded bitmap to improve performance in Windows
                        var capturePreview = WAT.options.webView.capturePreviewToBlobAsync();
                        var blurImage = document.querySelector(".webview-overlay svg image");

                        capturePreview.oncomplete = function (completeEvent) {
                            var reader = new window.FileReader();
                            reader.readAsDataURL(completeEvent.target.result);
                            reader.onloadend = function () {
                                // skip show blurred previous page if next page was already shown
                                if (!self.contentLoaded && WAT.options.stage.classList.contains("loading")) {
                                    clearOverlay.style.display = 'inline';

                                    blurImage.setAttribute("xlink:href", reader.result);
                                    blurOverlay.classList.remove("fadeOut");
                                }
                            };
                        };
                        capturePreview.start();
                    }
                }

                WAT.options.stage.classList.add("loading");
            } else if (WAT.options.stage.classList.contains("loading")) {
                    if (blurOverlay && clearOverlay) {
                        clearOverlay.style.display = "none";
                        blurOverlay.classList.add("fadeOut");
                    }

                    WAT.options.stage.classList.remove("loading");
            }
        },

        onActivated: function (e) {
            // On launch, we show an extended splash screen (versus the typical loading icon)
            if (e.detail.kind === Windows.ApplicationModel.Activation.ActivationKind.launch) {

                // disable nav and app bars until splash is removed
                if (WAT.options.navBar) {
                    // This line disables the Navbar before it is converted to a WinControl
                    WAT.options.navBar.setAttribute("data-win-options", "{ disabled : true }");
                }
                if (WAT.options.appBar) {
                    // This line disables the Appbar before it is converted to a WinControl
                    WAT.options.appBar.setAttribute("data-win-options", "{ disabled : true }");
                }

                // cached for use later
                splashScreen = e.detail.splashScreen;

                // Listen for window resize events to reposition the extended splash screen image accordingly.
                // This is important to ensure that the extended splash screen is formatted properly in response to snapping, unsnapping, rotation, etc...
                window.addEventListener("resize", updateSplashPositioning, false);

                var previousExecutionState = e.detail.previousExecutionState;
                var state = Windows.ApplicationModel.Activation.ApplicationExecutionState;
                if (previousExecutionState === state.notRunning
                    || previousExecutionState === state.terminated
                    || previousExecutionState === state.closedByUser) {
                    setupExtendedSplashScreen();
                }
                // Use setPromise to indicate to the system that the splash screen must not be torn down
                // until after processAll completes
                // e.setPromise(WinJS.UI.processAll());
            }
        },

        parseURL: function (url) {
            var parsed, path,
                parser = document.createElement("a");
            parser.href = url;

            parsed = {
                protocol: parser.protocol, // => "http:"
                hostname: parser.hostname, // => "example.com"
                port: parser.port, // => "3000"
                pathname: parser.pathname, // => "/pathname/"
                search: parser.search, // => "?search=test"
                query: parser.search, // => "?search=test"
                hash: parser.hash, // => "#hash"
                host: parser.host // => "example.com:3000"
            };

            path = parsed.pathname.match(/(.+?\/)([^/]+\.[^/]+)?$/);
            if (path) {
                parsed.dirpath = path[1];
                parsed.file = path[2];
            } else {
                parsed.dirpath = parsed.pathname + "/";
                parsed.file = "";
            }

            return parsed;
        },

        removeExtendedSplashScreen: function () {
            if (splashScreenEl) {
                splashScreenEl.style.display = "none";
            }

            if (WAT.config.navBar && WAT.config.navBar.enabled && WAT.options.navBar) {
                // As the winControl may not exist at this point, we ensure that this always work
                WAT.options.navBar.setAttribute("data-win-options", "{ disabled : false }");

            }
            if (WAT.config.appBar && WAT.config.appBar.enabled && WAT.options.appBar) {
                WAT.options.appBar.winControl.disabled = false;
            }

            splashScreen = null;
        },

        navigateBack: function () {
            return navigateBack();
        },

        afterProcessAllActions: afterProcessAllActions
    };

    // Private methods

    configureBackButton = function () {
        var hideBackRules = WAT.config.navigation.hideBackButtonOnMatch;

        backButtonRules.push(WAT.convertPatternToRegex(WAT.config.baseURL));

        if (hideBackRules && hideBackRules.length) {
            hideBackRules.forEach(function (pattern) {
                var fullPattern, regex;

                if (!pattern || !pattern.length) {
                    logger.warn("Skipping invalid back button hide rule:", pattern);
                    return;
                }

                fullPattern = pattern.replace(/\{baseURL\}/g, WAT.config.baseURL);
                regex = WAT.convertPatternToRegex(fullPattern);
                if (regex) {
                    logger.log("Adding back button hide rule: ", pattern, regex);
                    backButtonRules.push(regex);
                }
            });
        }

        if (WAT.options.backButton && !WAT.config.navigation.hideOnPageBackButton) {
            // we need to hold onto the parent since that is what gets toggled, not the actual <button>
            backButtons.push(WAT.options.backButton.parentNode);

            // handle back button clicks
            WAT.options.backButton.addEventListener("click", navigateBack);
        }
    };

    configureRedirects = function () {
        redirectActions = {
            showMessage: redirectShowMessage,
            popout: redirectPopout,
            redirect: redirectUrl,
            modal: true
        };

        WAT.config.redirects = (WAT.config.redirects || {});

        if (WAT.config.redirects.enabled === true && WAT.config.redirects.rules && WAT.config.redirects.rules.length) {
            WAT.config.redirects.rules.forEach(addRedirectRule);

        } else if (WAT.config.redirects.enabled === true && WAT.config.redirects.links && WAT.config.redirects.links.length) {
            // support old format for redirects
            WAT.config.redirects.links.forEach(processOldRedirectFormat);
        }

        if (WAT.config.redirects.enableCaptureWindowOpen === true && WAT.options.dialogView) {
            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", loadWindowOpenSpy);
            WAT.options.dialogView.addEventListener("MSWebViewDOMContentLoaded", loadWindowCloseSpy);
            WAT.options.dialogView.addEventListener("MSWebViewNavigationStarting", dialogViewNavigationStarting);

            WAT.options.webView.addEventListener("MSWebViewScriptNotify", handleWindowOpen);
            //WAT.options.dialogView.addEventListener("MSWebViewScriptNotify", handleWindowClose);
            WAT.options.webView.addEventListener("MSWebViewFrameNavigationStarting", handleWindowOpen);

            WAT.options.dialogView.parentNode.addEventListener("click", closeModalContent);
        }
    };

    dialogViewNavigationStarting = function (e) {
        if (WAT.config.offline && WAT.config.offline.superCache && WAT.config.offline.superCache.enabled !== false) {
            var args = new WatExtensions.SuperCache.NavigatingEventArgs(e.uri);
            if (WatExtensions.SuperCacheManager.onNavigating(args)) {
                e.preventDefault();
                WAT.options.dialogView.navigate(args.targetUri);
            }
        }
    };

    loadWindowOpenSpy = function () {
        var scriptString, exec;

        scriptString =
        "(function() {\n" +
            "var match, " +
                "openWindow = window.open;\n" +
            "window.open = function() {\n" +
                "console.log('intercepted window.open going to: ' + arguments[0]);\n" +
                "match = false;\n";

        // see if the request URL matches a redirect rule...
        redirectRules.forEach(function (rule) {
            if (rule.action === "modal") {
                scriptString += "if (" + rule.regex + ".test(arguments[0])) { match = true; }\n";
            }
        });

        scriptString +=
                "if (match) {\n" +
                    "if (window.location.protocol === 'https:') {\n" +
                        "window.external.notify('WINDOWOPEN~~' + arguments[0]);\n" +
                    "}\n" +
                    "else {\n" +
                        "var iframe = document.createElement('iframe');\n" +
                        "iframe.width = 0;\n" +
                        "iframe.height = 0;\n" +
                        "iframe.id = Math.random();\n" +
                        "iframe.onload = function () { this.parentNode.removeChild(this); };\n" +
                        "iframe.src = \"" + WAT.config.baseURL + "\" + \"?WINDOWOPEN=\" + encodeURIComponent(arguments[0]);\n" +
                        "document.body.appendChild(iframe);\n" +
                    "}\n" +
                    "return null;\n" +
                "} else {\n" +
                    // if none of the redirect rules matched open as normal (external browser)
                    "return openWindow.apply(this, Array.prototype.slice.call(arguments));\n" +
                "}\n" +
            "};\n" + // end of window.open override
        "})();";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    handleWindowOpen = function (e) {
        var url, parsed, path, content;

        url = getUriParameter(e, "WINDOWOPEN");
        if (!url) {
            // oops, this isn't ours
            return;
        }

        logger.log("captured external window.open call to: ", url);

        if (!/^http/.test(url)) {
            if (/^\//.test(url)) {
                // path from root
                parsed = self.parseURL(WAT.config.baseURL);
                url = parsed.protocol + "//" + parsed.hostname + url;
            } else {
                // relative path
                parsed = self.parseURL(WAT.options.webView.src);
                url = parsed.protocol + "//" + parsed.hostname + parsed.dirpath + url;
            }
        }

        if (WAT.options.closeButton) {
            WAT.options.closeButton.style.display = "block";

            // Hide close button if requested for this URL
            if (WAT.config.redirects.enabled === true) {
                redirectRules.forEach(function (rule) {
                    if (rule.regex.test(url) && rule.hideCloseButton === true) {
                        WAT.options.closeButton.style.display = "none";
                    }
                });
            }
        }

        WAT.options.dialogView.navigate(url);
        WAT.options.dialogView.parentNode.style.display = "block";
    };

    getUriParameter = function (e, parameter) {
        if (e.type === "MSWebViewScriptNotify") {
            var content = e.value.split(/~~/);
            if (content.length === 2 && content[0] === parameter) {
                return content[1];
            }
        }
        else if (e.type === "MSWebViewFrameNavigationStarting") {
            var uriString = e.uri;
            if (uriString.indexOf('?') > -1) {
                uriString = uriString.split('?')[1];
            }

            var queryStringParams = uriString.split('&');
            var length = queryStringParams.length;

            for (var i = 0; i < length; i++) {
                if (queryStringParams[i].indexOf(parameter + '=') > -1) {
                    return decodeURIComponent(queryStringParams[i].split(parameter + '=')[1]);
                }
            }
        }

        return null;
    };

    loadWindowCloseSpy = function (e) {
        var scriptString, exec,
            modalClosed = false;

        WAT.options.dialogView.addEventListener("MSWebViewScriptNotify", handleWindowClose);
        WAT.options.dialogView.addEventListener("MSWebViewFrameNavigationStarting", handleWindowClose);

        // See if we need to close the modal based on URL
        if (WAT.config.redirects.enabled === true) {
            redirectRules.forEach(function (rule) {
                if (rule.action === "modal" && rule.closeOnMatchRegex && rule.closeOnMatchRegex.test(e.uri)) {
                    modalClosed = true;
                    closeModalContent();
                }
            });
            if (modalClosed) {
                return; // nothing else to do, the modal is closed
            }
        }

        scriptString =
        "(function() {\n" +
            "var closeWindow = window.close;\n" +
            "window.close = function() {\n" +
                "console.log('intercepted window.close');\n" +
                "if (window.location.protocol === 'https:') {\n" +
                    "window.external.notify('WINDOWCLOSE~~' + window.location.href);\n" +
                "}\n" +
                "else {\n" +
                    "var iframe = document.createElement('iframe');\n" +
                    "iframe.width = 0;\n" +
                    "iframe.height = 0;\n" +
                    "iframe.id = Math.random();\n" +
                    "iframe.onload = function () { this.parentNode.removeChild(this); };\n" +
                    "iframe.src = \"" + WAT.config.baseURL + "?WINDOWCLOSE=\" + encodeURIComponent(window.location.href);\n" +
                    "document.body.appendChild(iframe);\n" +
                "}\n" +
                "return;\n" +
            "};\n" + // end of window.close override
        "})();";

        exec = WAT.options.dialogView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    var handleWindowClose = function (e) {
        var metadata = getUriParameter(e, "WINDOWCLOSE");

        if (metadata) {
            logger.log("captured external window.close call: ", metadata);

            closeModalContent();
        }
    };

    closeModalContent = function () {
        WAT.options.dialogView.src = "about:blank";
        WAT.options.dialogView.parentNode.style.display = "none";

        if (WAT.config.redirects.refreshOnModalClose === true) {
            WAT.options.webView.refresh();
        }
    };

    addRedirectRule = function (rule) {
        var ruleCopy = { original: rule };

        if (!redirectActions[rule.action]) {
            logger.warn("Looks like that is an invalid redirect action... ", rule.action);
            return;
        }

        ruleCopy.pattern = rule.pattern.replace(/\{baseURL\}/g, WAT.config.baseURL);
        ruleCopy.regex = WAT.convertPatternToRegex(ruleCopy.pattern);

        ruleCopy.action = rule.action;
        ruleCopy.message = rule.message || "";
        ruleCopy.url = (rule.url) ? rule.url.replace(/\{baseURL\}/g, WAT.config.baseURL) : "";

        ruleCopy.hideCloseButton = rule.hideCloseButton || false;
        ruleCopy.closeOnMatch = rule.closeOnMatch || null;
        if (rule.closeOnMatch) {
            ruleCopy.closeOnMatchRegex = WAT.convertPatternToRegex(rule.closeOnMatch);
        } else {
            rule.closeOnMatchRegex = null;
        }

        logger.info("Adding redirect rule (" + ruleCopy.action + ") with pattern/regex: " + ruleCopy.pattern, ruleCopy.regex);

        redirectRules.push(ruleCopy);
    };

    processOldRedirectFormat = function (rule) {
        var actionMatch,
            newRule = { action: null, link: rule };

        newRule.pattern = rule.link;
        actionMatch = rule.action.match(/^showMessage\:\s*(.*)/);
        if (actionMatch) {
            newRule.action = "showMessage";
            newRule.message = actionMatch[1];
        } else {
            newRule.action = "redirect";
            newRule.url = rule.action;
        }

        addRedirectRule(newRule);
    };

    webViewNavStart = function (e) {
        self.contentLoaded = false;
        self.toggleLoadingScreen(true);
        self.toggleBackButton(false);

        // Follow any redirect rules
        if (WAT.config.redirects.enabled === true) {
            redirectRules.forEach(function (rule) {
                if (rule.regex.test(e.uri) && WAT.isFunction(redirectActions[rule.action])) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    redirectActions[rule.action](rule, e.uri);
                    self.toggleLoadingScreen(false);
                    if (WAT.options.webView.canGoBack === true) {
                        self.toggleBackButton(true);
                    }
                }
            });
        }
    };

    navigateBack = function (e) {
        var view = WAT.options.webView;

        if (e && e.currentTarget.getAttribute("disabled") === "disabled") {
            e.preventDefault();
            return false;
        }

        var offlineModule = WAT.getModule("offline");
        if (offlineModule && offlineModule.active && WAT.options.offlineView && !offlineModule.useSuperCache) {
            view = WAT.options.offlineView;
        }

        if (offlineModule && offlineModule.active && WAT.options.offlineView && offlineModule.useSuperCache && view.canGoBack) {
            view.style.display = "block";
            WAT.options.offlineView.style.display = "none";
            offlineModule.active = false;
        }

        if (!view.canGoBack) {
            return false;
        }

        try {
            view.goBack();
        } catch (err) {
            return false;
        }

        if (WAT.config.appBar && WAT.config.appBar.enabled) {
            WAT.options.appBar.winControl.hide();
        }

        if (WAT.config.navBar && WAT.config.navBar.enabled && WAT.environment.isWindows) {
            WAT.options.navBar.parentNode.winControl.hide();
        }

        return true;
    }


    webViewNavComplete = function () {

        self.toggleLoadingScreen(false);

        var showBackButton = true;

        if (splashScreen) {
            self.removeExtendedSplashScreen();
        }

        if (WAT.options.webView.canGoBack === true) {
            backButtonRules.forEach(function (rule) {
                if (rule.test(WAT.options.webView.src)) {
                    showBackButton = false;
                }
            });
        } else {
            showBackButton = false;
        }

        if (WAT.config.header && WAT.config.header.enabled === true) {
            var header = WAT.getModule("header");

            if (header)
                header.setPageTitle(!showBackButton);
        }

        self.toggleBackButton(showBackButton);
    }

    webViewLoaded = function () {
        self.contentLoaded = true;
    };

    setupLoadingContent = function () {
        var partial;

        if (!WAT.config.navigation.pageLoadingPartial || !WAT.options.loadingWrapper) {
            return;
        }

        partial = "ms-appx://" + ((/^\//.test(WAT.config.navigation.pageLoadingPartial)) ? "" : "/") + WAT.config.navigation.pageLoadingPartial;

        logger.log("Getting loading partial file from " + partial);

        var url = new Windows.Foundation.Uri(partial);
        Windows.Storage.StorageFile.getFileFromApplicationUriAsync(url)
            .then(
                loadingPartialFileLoadHandler,
                function (err) {
                    // log this error, but let things proceed anyway
                    logger.error("Error getting custom loading partial file", err);
                }
            );
    };

    loadingPartialFileLoadHandler = function (file) {
        Windows.Storage.FileIO.readTextAsync(file)
            .then(
                function (text) {
                    WAT.options.loadingWrapper.innerHTML = text;
                },
                function (err) {
                    // log this error, but let things proceed anyway
                    logger.warn("Error reading custom loading partial file", err);
                }
            );
    };


    // app and nav bar setup

    setupAppBar = function () {
        var appBarEl = WAT.options.appBar;

        WAT.config.appBar = (WAT.config.appBar || {});

        if (!WAT.config.appBar.enabled || !appBarEl) {
            if (appBarEl) {
                appBarEl.parentNode.removeChild(appBarEl);
                appBarEl = null;
            }
            return;
        }

        WAT.config.appBar.buttons = (WAT.config.appBar.buttons || []);

        WAT.config.appBar.buttons.forEach(function (menuItem) {

            if (WAT.environment.isWindowsPhone && WAT.config.cortana.appBar)
                phraseList.push(menuItem.label); //adding appbar items to cortana phrases

            // Do not include the Setting button in the appBar in Windows Phone apps
            if (menuItem.action !== "settings" || WAT.environment.isWindows) {

                var btn = document.createElement("button");
                btn.className = "win-command win-global";
                btn.setAttribute("role", "menuitem");

                var section = (menuItem.section || "global");

                new WinJS.UI.AppBarCommand(btn, { label: menuItem.label, icon: menuItem.icon, section: section });

                setButtonAction(btn, menuItem);

                appBarEl.appendChild(btn);
            }
        });
    };

    setupNavBar = function () {
        var needSplitEvent = false,
            navBarEl = WAT.options.navBar;

        WAT.config.navBar = (WAT.config.navBar || {});

        //we are checking to see if the elemnt of navbar exists, if it doesn't then we are probably building for phone and we just want to change this setting to false, so that we don't have to change the other code in the app
        //if (!WinJS.UI.NavBarCommand) {
        //    WAT.config.navBar.enabled = false;
        //    navBarEl.enabled = false;
        //}

        // for phone, if navbar is enabled and header is disabled, enable header (disable navbar if you don't want header)
        if (WAT.environment.isWindowsPhone && WAT.config.header && !WAT.config.header.enabled && WAT.config.navBar.enabled) {
            WAT.config.header.enabled = true;
        }

        if (!WAT.config.navBar.enabled || !navBarEl) {
            if (navBarEl && navBarEl.parentNode.parentNode) {
                // we have to remove the WinJS.UI.NavBar control, but the 
                // "navBar" option passes in the WinJS.UI.NavBarConatiner
                navBarEl.parentNode.parentNode.removeChild(navBarEl.parentNode);
                navBarEl = null;

                if (WAT.environment.isWindowsPhone) {
                    disableNavDrawer();
                }
            }
            return;
        }

        WAT.config.navBar.maxRows = (WAT.config.navBar.maxRows || 1);

        // Add explicit buttons first...
        if (WAT.config.navBar.buttons) {
            WAT.config.navBar.buttons.forEach(function (menuItem) {
                if (WAT.environment.isWindows) {
                    var btn = createNavBarButton(menuItem);

                    if (btn) {
                        navBarEl.appendChild(btn);
                    }
                    if (menuItem.children && menuItem.children.length) {
                        needSplitEvent = true;
                    }
                }
                else if (WAT.environment.isWindowsPhone) { // initializing navdrawer for phone
                    navDrawerInit();
                    if(menuItem.icon && menuItem.icon != "" && menuItem.icon.substring(0,2) != "ms") {
                        menuItem.icon = "ms-appx:///images/enums/" + menuItem.icon + ".png";
                    }

                    // adding buttons to the navdrawer list
                    if (menuItem.children) {
                        navDrawerList.push(menuItem); //TODO: nested items
                        menuItem.children.forEach(function (childItem) {
                            if (WAT.config.cortana && WAT.config.cortana.navBar) {
                                phraseList.push(childItem.label);  //adding child items to cortana phrases
                            }

                            if (childItem.icon && childItem.icon != "" && childItem.icon.substring(0,2) != "ms") {
                                childItem.icon = "ms-appx:///images/enums/" + childItem.icon + ".png";
                            }
                            childItem.label = '  ' + childItem.label;
                            navDrawerList.push(childItem);
                        });
                    }
                    else {
                        if (WAT.config.cortana && WAT.config.cortana.navBar) {
                            phraseList.push(menuItem.label); //adding to cortana phrases
                        }
                        navDrawerList.push(menuItem);
                    }
                }
            });
        }

        // Then any pageElement nav requested by config...
        if (WAT.config.navBar.pageElements && WAT.config.navBar.pageElements.navElements) {

            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", injectNavbarBuildingQuery);

        } else {
            // If we are not processing webview nav elements then we are ready to process the nav bar UI declarations
            initUIDeclarations();
        }

        // If there was at least one navbar item with children, set up splitt toggle event...
        if (needSplitEvent) {
            navBarEl.addEventListener("splittoggle", function (e) {
                toggleNestedNav(e.detail.navbarCommand, e.detail.opened);
            });
        }
    };

    disableNavDrawer = function () {
        // disabling navDrawer
        var surface = document.getElementById("surface");
        surface.style.display = "block";
        surface.style.width = "100%";
        document.getElementById("hamburger").style.display = "none";
        document.getElementById("search-box").style.display = "none";
        WAT.options.navDrawer = null;
    };

    // initializing navdrawer
    navDrawerInit = function () {
        document.querySelector(".header .hamburger").addEventListener("click", toggleMenu);
        document.querySelector(".content").addEventListener("click", returnToContent);
        document.querySelector(".viewport").scrollLeft = _menuWidth;
        document.addEventListener("iteminvoked", itemInvokedHandler, false);
    };

    // navdrawer scroll
    returnToContent = function (e) {
        var viewport = document.querySelector(".viewport");
        if (viewport.scrollLeft < _menuWidth || viewport.scrollLeft >= _menuWidth * 2) {
            viewport.msZoomTo({
                contentX: _menuWidth
            });
        }
    };

    // toggles navdrawer
    toggleMenu = function (e) {
        var viewport = document.querySelector(".viewport");
        var scrollPos = (viewport.scrollLeft > 0) ? 0 : _menuWidth;
        viewport.msZoomTo({
            contentX: scrollPos
        });
    };

    // handles items in the navdrawer
    itemInvokedHandler = function (eventObject) {
        eventObject.detail.itemPromise.done(function (invokedItem) {
            switch (invokedItem.data.action) {
                case "home":
                    WAT.goToLocation(WAT.config.baseUrl);
                    break;
                case "eval":
                    var scriptString = "(function() { " + invokedItem.data.data + " })();";
                    var exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
                    exec.start();
                    break;
                case "back":
                    WAT.options.webView.goBack();
                    break;
                case "nested":
                    break;
                default:
                    WAT.goToLocation(invokedItem.data.action);
                    break;
            }
            toggleMenu();
        });
    };

    initUIDeclarations = function () {
        WAT.options.navBar.parentNode.setAttribute("data-win-control", "WinJS.UI.NavBar");
        WAT.options.navBar.setAttribute("data-win-control", "WinJS.UI.NavBarContainer");
        WAT.options.navBar.setAttribute("data-win-options", "{ maxRows: " + WAT.config.navBar.maxRows + " }");
    };

    setStickyBits = function () {
        var appBarHeight, navHeight,
            height = (parseInt(WAT.options.stage.offsetHeight) || 0);

        WAT.options.webView.removeEventListener("MSWebViewDOMContentLoaded", setStickyBits);

        if (WAT.config.navBar && WAT.config.navBar.enabled === true && WAT.config.navBar.makeSticky) {
            WAT.options.navBar.disabled = false;
            WAT.options.navBar.parentNode.winControl.sticky = true;
            WAT.options.navBar.parentNode.winControl.show();

            WAT.options.navBar.parentNode.winControl.addEventListener("afterhide", function (e) {
                WAT.options.navBar.parentNode.winControl.show();
            });

            navHeight = (parseInt(WAT.options.navBar.parentNode.offsetHeight) || 0);

            height -= navHeight;
            WAT.options.stage.style.paddingTop = '30px';
            WAT.options.stage.style.top = navHeight + "px";
            WAT.options.backButton.parentNode.style.top = navHeight + "px";
        }

        if (WAT.config.appBar && WAT.config.appBar.enabled === true && WAT.config.appBar.makeSticky) {
            WAT.options.appBar.disabled = false;
            WAT.options.appBar.winControl.sticky = true;
            WAT.options.appBar.winControl.show();

            WAT.options.appBar.winControl.addEventListener("afterhide", function (e) {
                WAT.options.appBar.winControl.show();
            });

            appBarHeight = (parseInt(WAT.options.appBar.offsetHeight) || 0);

            height -= appBarHeight;
        }

        // WAT.options.stage.style.height = height + "px";
        // WAT.options.webView.style.height = height + "px";
        // WAT.options.offlineView.style.height = height + "px";
    };

    createNavBarButton = function (menuItem) {
        var btn = document.createElement("div"),
            hasChildren = !!(menuItem.children && menuItem.children.length),
            options = { label: menuItem.label, icon: menuItem.icon, splitButton: hasChildren };

        btn.setAttribute("role", "menuitem");

        new WinJS.UI.NavBarCommand(btn, options);

        if (hasChildren) {
            // set up nested navigation if children are present
            setupNestedNav(menuItem, btn);
        }

        setButtonAction(btn, menuItem);

        return btn;
    };

    injectNavbarBuildingQuery = function () {
        var scriptString, exec,
            config = WAT.config.navBar.pageElements;

        WAT.options.webView.removeEventListener("MSWebViewDOMContentLoaded", injectNavbarBuildingQuery);

        config.linkAttribute = (config.linkAttribute || "href");

        scriptString = "(function() {" +
                         "var navItem, linkElem, textElem, iconElem;" +
                         "var navItems = [];" +
                         "var navElements = document.querySelectorAll(\"" + config.navElements + "\");" +
                         "if (navElements && navElements.length) {" +
                           "for (var i = 0; i < navElements.length; ++i) {" +
                             "navItem = { label: '', action: 'home', icon: 'link' };" +
                             "linkElem = navElements[i];" +
                             "textElem = iconElem = null;";

        // get nav button link action (url)
        if (config.linkElement) {
            scriptString += "linkElem = navElements[i].querySelector(\"" + config.linkElement + "\");";
        }
        scriptString += "if (!linkElem) { continue; }" +
                             "navItem.action = linkElem.getAttribute('" + config.linkAttribute + "');";

        // get nav button text
        scriptString += "textElem = linkElem;";
        if (config.textElement) {
            scriptString += "textElem = navElements[i].querySelector(\"" + config.textElement + "\");";
        }
        scriptString += "if (!textElem) { textElem = linkElem; }" +
                             "navItem.label = (textElem.text || '');";

        // get nav button icon (if specified)
        if (config.iconElement && config.iconAttribute) {
            scriptString += "iconElem = navElements[i].querySelector(\"" + config.iconElement + "\");";
        }
        scriptString += "if (iconElem) {" +
                               "navItem.icon = iconElem.getAttribute('" + config.iconAttribute + "');" +
                             "}" +

                             "navItems.push(navItem);" +
                           "}" +
                         "}" +
                         "return JSON.stringify(navItems);" +
                       "})();";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);

        exec.oncomplete = function (scriptArg) {
            processWebviewNavLinks(scriptArg.target.result);
        };
        exec.onerror = function (errArg) {
            console.log(errArg);
        };

        exec.start();

    };

    processWebviewNavLinks = function (content) {
        var navItems,
            navBarEl = WAT.options.navBar;

        if (content) {
            try {
                navItems = JSON.parse(content);
            } catch (err) {
                logger.error("Unable to parse nav items from webview: ", err);
                navItems = [];
            }

            if (navItems && navItems.length) {
                WAT.navItems = new WinJS.Binding.List(navItems);

                navItems.forEach(function (menuItem) {
                    logger.log("creating button with: ", menuItem);

                    var btn = createNavBarButton(menuItem);

                    if (btn) {
                        navBarEl.appendChild(btn);
                    }
                });

                initUIDeclarations();
            }
        }
    };

    setupNestedNav = function (menuItem, btn) {
        var nestedNavID = WAT.getGUID(),
            flyout = document.createElement("div"),
            nestedNavContainer = document.createElement("div");

        logger.log("Adding nested navigation on barItem: ", menuItem.label);

        flyout.setAttribute("id", nestedNavID);
        flyout.setAttribute("data-win-control", "WinJS.UI.Flyout");
        flyout.setAttribute("data-win-options", "{ placement: 'bottom' }");
        flyout.className += flyout.className ? ' navbar-submenu' : 'navbar-submenu';

        btn.setAttribute("data-nestednav", nestedNavID);
        nestedNavContainer.setAttribute("data-win-control", "WinJS.UI.NavBarContainer");

        menuItem.children.forEach(function (subItem) {
            var nestedBtn = document.createElement("div");

            nestedBtn.setAttribute("role", "menuitem");

            new WinJS.UI.NavBarCommand(nestedBtn, {
                label: subItem.label,
                icon: subItem.icon
            });

            setButtonAction(nestedBtn, subItem);
            nestedNavContainer.appendChild(nestedBtn);
        });

        logger.log("Adding nested navigation UI to DOM");

        flyout.appendChild(nestedNavContainer);
        document.body.appendChild(flyout);

        afterProcessAllActions.push(function () {
            // make sure the splittoggle button (arrow) is correct
            flyout.winControl.addEventListener('beforehide', function () {
                btn.winControl.splitOpened = false;
            });
        });
    };

    toggleNestedNav = function (parentNavbarCommand, opened) {
        var nestedControl = document.getElementById(parentNavbarCommand.element.getAttribute("data-nestednav")).winControl,
            nestedNavBarContainer = (nestedControl && nestedControl.element.querySelector('.win-navbarcontainer'));

        if (!nestedControl || !nestedNavBarContainer) {
            return;
        }

        if (opened) {
            nestedControl.show(parentNavbarCommand.element);
            // Switching the navbarcontainer from display none to display block requires 
            // forceLayout in case there was a pending measure.
            nestedNavBarContainer.winControl.forceLayout();
            // Reset back to the first item.
            nestedNavBarContainer.currentIndex = 0;

        } else {
            nestedControl.hide();
        }
    };

    setButtonAction = function (btn, menuItem) {
        var action = menuItem.action.toLowerCase(),
            data = menuItem.data,
            handler = barActions[action];

        if (!handler) {
            // default handler is webview navigation
            handler = barActions["navigate"];
            data = menuItem.action;
        }

        if (!WAT.isFunction(handler)) {
            // This is a non-operational bar item (maybe nested nav?)
            return;
        }

        if (data === "home") {
            data = WAT.config.baseURL;
        }

        if (action === "back") {
            backButtons.push(btn);
        }

        btn.dataset.barActionData = data;
        //handle children case
        if (menuItem.children && menuItem.children.length) {
            btn.children[0].addEventListener("click", handler);
        } else {

            btn.addEventListener("click", handler);
        }

    };


    // app and nav bar action handlers

    handleBarEval = function () {
        var scriptString, exec;

        scriptString = "(function() { " + this.dataset.barActionData + " })();";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    handleBarNavigate = function () {
        //if dataset doesn't exist, look for parent, becuse it will be a nested button assignment that is a child
        var url = (this.dataset.barActionData || this.parentNode.dataset.barActionData || WAT.config.baseURL);
        WAT.goToLocation(url);
    };

    handleBarSettings = function () {
        if (WAT.environment.isWindows) {
            Windows.UI.ApplicationSettings.SettingsPane.show();
        } else if (WAT.environment.isWindowsPhone) {
            WAT.options.webView.navigate("ms-appx-web:///template/settings.html");
        } else {

        }
    };

    handleBarShare = function () {
        Windows.ApplicationModel.DataTransfer.DataTransferManager.showShareUI();
    };


    // redirect rule action handlers

    redirectShowMessage = function (rule) {
        logger.log("Showing message: " + rule.message);
        return new Windows.UI.Popups.MessageDialog(rule.message).showAsync();
    };

    redirectPopout = function (rule, linkUrl) {
        logger.log("Popping out URL to: " + linkUrl);
        return Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(linkUrl));
    };

    redirectUrl = function (rule) {
        logger.log("Redirecting user to link in app: " + rule.url);

        WAT.goToLocation(rule.url);
    };


    // spash screen functionality

    setupExtendedSplashScreen = function () {
        splashScreenEl = WAT.options.extendedSplashScreen;
        splashScreenImageEl = (splashScreenEl && splashScreenEl.querySelector(".extendedSplashImage"));
        splashLoadingEl = (splashScreenEl && splashScreenEl.querySelector(".loading-progress"));

        if (!splashScreen || !splashScreenEl || !splashScreenImageEl) { return; }

        updateSplashPositioning();
        updateExtendedSplashScreenStyles();

        // Once the extended splash screen is setup, apply the CSS style that will make the extended splash screen visible.
        splashScreenEl.style.display = "block";
    };

    updateExtendedSplashScreenStyles = function () {
        if (WAT.config.styles && WAT.config.styles.extendedSplashScreenBackground && splashScreenEl) {
            splashScreenEl.style.backgroundColor = WAT.config.styles.extendedSplashScreenBackground;
        }
    };

    updateSplashPositioning = function () {
        if (!splashScreen || !splashScreenImageEl) { return; }
        // Position the extended splash screen image in the same location as the system splash screen image.
        if (WAT.environment.isWindows) {
            splashScreenImageEl.style.top = splashScreen.imageLocation.y + "px";
            splashScreenImageEl.style.left = splashScreen.imageLocation.x + "px";
            splashScreenImageEl.style.height = splashScreen.imageLocation.height + "px";
            splashScreenImageEl.style.width = splashScreen.imageLocation.width + "px";
        } else {
            var curOrientation = Windows.Devices.Sensors.SimpleOrientationSensor.getDefault().getCurrentOrientation();
            if (curOrientation == Windows.Devices.Sensors.SimpleOrientation.rotated270DegreesCounterclockwise || curOrientation == Windows.Devices.Sensors.SimpleOrientation.rotated90DegreesCounterclockwise) {
                splashScreenImageEl.src = "/images/splashscreenRotated.png";
            } else {
                splashScreenImageEl.src = "/images/splashscreen.png";

            }
            splashScreenImageEl.style.width = "100%";
            splashScreenImageEl.style.height = "100%";
        }

        if (splashLoadingEl) {
            if (WAT.environment.isWindows) {
                splashLoadingEl.style.top = (splashScreen.imageLocation.y + splashScreen.imageLocation.height + 20) + "px";
            } else {
                splashLoadingEl.style.top = (window.innerHeight * 0.8) + "px";
            }
        }
    };

    // Module Registration
    WAT.registerModule("nav", self);

})(window.WAT, window.WinJS, window.Windows);