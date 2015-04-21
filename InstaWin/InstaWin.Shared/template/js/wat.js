/*
Copyright (c) Microsoft Corporation

All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.  You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0   

THIS CODE IS PROVIDED *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABLITY OR NON-INFRINGEMENT.  

See the Apache Version 2.0 License for specific language governing permissions and limitations under the License. 


*/

(function (winJS) {
    "use strict";
    // Private method declarations
    var start,
        configLoadHandler,
        configErrorHandler,
        webViewLoaded,
        webViewNavigationStarting,
        handleUncaughtErrors,
        filesConfigLoadHandler,
        getFilesConfigAsync,
        loadConfigAsync,
        initializeSpeechPhrases,
        loadManifestStylesAsync,

        // Private variable declarations
        loadTimeout,
        logger = window.console,
        modules = {},
        secondaryPinLocation = null,
        utilities,
        configModule,
        guids = [],
        configIsWebApplicationManifest = false;

    // Public API
    window.WAT = {

        // Public variables
        version: "1.1",
        config: {},
        options: {},
        wrapperDocHead: null,

        // Public methods

        /**
         * Initialization script to start everything off.
         * @param {Object} options The collection of options
         * @return void (Use options.initCallback to get the result of the init call. A `null` value indicates success, anything else is an error.)
         */
        init: function (options) {
            var uri;
            WAT.options = options = (options || {});

            options.initCallback = (options.initCallback || function () { });

            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            if (WAT.getModule("utilities")) {
                utilities = WAT.getModule("utilities");
            }

            WinJS.Application.addEventListener("error", handleUncaughtErrors);

            if (!options.stage ||
                !options.webView ||
                !options.backButton) {
                logger.error("One or more of the primary html elements of the wrapper html file were not provided to the WAT engine.");
                options.initCallback("One or more of the primary html elements of the wrapper html file were not provided to the WAT engine.");
            }

            WAT.wrapperDocHead = document.querySelector("head");

            logger.info("Getting config file from " + options.configFile);

            options.configFile = "ms-appx:///" + (WAT.options.configFile || "config/config.json");
            options.filesConfigFile = "ms-appx:///config/files.json";
            var filesuri = new Windows.Foundation.Uri(options.filesConfigFile);
            Windows.Storage.StorageFile.getFileFromApplicationUriAsync(filesuri)
                .done(
                    filesConfigLoadHandler,
                    function (err) { configErrorHandler(err, 1); }
                );
        },

        activationHandler: function (e) {
            var namespace;

            for (namespace in modules) {
                if (modules[namespace].onActivated) {
                    logger.log("Calling onActivated for ", namespace);
                    modules[namespace].onActivated(e);
                }
            }

            if (e.detail.kind === Windows.ApplicationModel.Activation.ActivationKind.launch) {
                if (e.detail.arguments !== "") {
                    secondaryPinLocation = e.detail.arguments;
                    WAT.goToLocation(secondaryPinLocation);
                }
            }
        },

        registerModule: function (namespace, module) {
            if (!namespace || !module || !module.start) {
                logger.warn("Unable to register module: ", namespace, module, module.start);
                return null;
            }

            logger.log("Registering module: ", namespace);
            modules[namespace.toString()] = module;
            return module;
        },

        getModule: function (namespace) {
            if (modules[namespace.toString()]) {
                return modules[namespace.toString()];
            } else {
                return null;
            }
        },

        goToLocation: function (location) {
            var target = new Windows.Foundation.Uri(location || WAT.config.baseURL);

            if (WAT.config.offline && WAT.config.offline.superCache && WAT.config.offline.superCache.enabled !== false) {
                target = WatExtensions.SuperCacheManager.buildLocalProxyUri(new Windows.Foundation.Uri(WAT.config.baseURL), target);
            }

            WAT.options.webView.navigate(target.toString());

            //here we'll close the menus when we start to navigate

            if (WAT.config.appBar && WAT.options.appBar.winControl && WAT.config.appBar.enabled) {
                WAT.options.appBar.winControl.hide();
            }
            if (WAT.config.navBar && WAT.config.navBar.enabled && WAT.options.navBar.parentNode && WAT.options.navBar.parentNode.winControl) {
                WAT.options.navBar.parentNode.winControl.hide();
            }

        },

        escapeRegex: function (str) {
            return ("" + str).replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
        },

        convertPatternToRegex: function (pattern, excludeLineStart, excludeLineEnd) {
            var isNot = (pattern[0] == '!');
            if (isNot) { pattern = pattern.substr(1) };

            var regexBody = WAT.escapeRegex(pattern);

            excludeLineStart = !!excludeLineStart;
            excludeLineEnd = !!excludeLineEnd;

            regexBody = regexBody.replace(/\\\?/g, ".?").replace(/\\\*/g, ".*?");
            if (isNot) { regexBody = "((?!" + regexBody + ").)*"; }
            if (!excludeLineStart) { regexBody = "^" + regexBody; }
            if (!excludeLineEnd) { regexBody += "$"; }

            return new RegExp(regexBody);
        },

        isFunction: function (f) {
            return Object.prototype.toString.call(f) == '[object Function]';
        },

        getGUID: function () {
            var newGUID = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            if (guids.indexOf(newGUID) > -1) {
                return self.getGUID();
            } else {
                return newGUID;
            }
        },

        /**
         * Promise completes with the lowest level folder in the given path, 
         * creating subfolders along the way
         * @param {String} path The path to the lowest subfolder you want a reference to
         * @param {StorageFolder} rootFolder The folder to begin at for this iteration
         * @return {Promise}
         */
        getFolderFromPathRecursive: function (path, rootFolder) {
            var normalizedPath = path.replace(/\\/g, "/").replace(/\/?[^\/]+\.[^\.\/]+$/, ""), // remove a possible filename from the end of the path and fix slashes
                folders = normalizedPath.split(/\//), // get an array of the folders in the path
                subFolderName = folders.shift(); // remove the first folder in the path as the new one to create

            return new WinJS.Promise(function (complete, error) {
                if (!subFolderName || !subFolderName.length) {
                    complete(rootFolder);
                    return;
                }

                rootFolder
                    .createFolderAsync(subFolderName, Windows.Storage.CreationCollisionOption.openIfExists)
                        .then(
                            function (folder) {
                                return WAT.getFolderFromPathRecursive(folders.join("/"), folder);
                            },
                            error
                        )
                        .then(
                            function (folder) {
                                complete(folder);
                                return;
                            },
                            error
                        );
            });
        },

        getWeekNumber: function (d) {
            var yearStart, week;

            d = (d || new Date());
            d = new Date(+d); // Copy date so don't modify original

            d.setHours(0, 0, 0);
            // Set to nearest Thursday: current date + 4 - current day number
            // Make Sunday's day number 7
            d.setDate(d.getDate() + 4 - (d.getDay() || 7));
            // Get first day of year
            yearStart = new Date(d.getFullYear(), 0, 1);
            // Calculate full weeks to nearest Thursday
            week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            // Return array of year and week number (year may have changed)
            return [d.getFullYear(), week];
        },

        getFilesWithProperties: function (files) {
            var promises = [],
                filesWithProps = [];

            return new WinJS.Promise(function (complete, error) {
                files.forEach(function (file) {
                    promises.push(
                        file.getBasicPropertiesAsync().then(function (props) {
                            filesWithProps.push({
                                fileObject: file,
                                name: file.name,
                                dateModified: props.dateModified,
                                size: props.size
                            });
                        })
                    );
                });

                WinJS.Promise.join(promises).then(
                    function () {
                        complete(filesWithProps);
                    },
                    error
                );
            });
        },

        isFileCachedAsync: function (cachedFilePath) {
            return new WinJS.Promise(function (complete) {
                var cachedFile = new Windows.Foundation.Uri(cachedFilePath);
                var validFile = false;
                Windows.Storage.StorageFile.getFileFromApplicationUriAsync(cachedFile)
                    .then(
                        function (file) {
                            validFile = (!!file.displayName); //file.isAvailable;
                        },
                        function (err) {
                            validFile = false;
                        }
                    )
                    .done(function () {
                        complete(validFile);
                    });
            });
        },

        getCachedFileAsTextAsync: function (cachedFilePath) {
            return new WinJS.Promise(function (complete) {
                var cachedFile = new Windows.Foundation.Uri(cachedFilePath);
                Windows.Storage.StorageFile.getFileFromApplicationUriAsync(cachedFile)
                    .then(
                        function (file) {
                            return Windows.Storage.FileIO.readTextAsync(file);
                        }
                   )
                    .done(function (fileContent) {
                        complete(fileContent);
                    });
            });
        },

        cacheHostedFileAsync: function (path, cachedFileName) {
            return new WinJS.Promise(function (complete) {
                var applicationData = Windows.Storage.ApplicationData.current;
                var localFolder = applicationData.localFolder;
                var networkInfo = Windows.Networking.Connectivity.NetworkInformation;
                var internetProfile = networkInfo.getInternetConnectionProfile();
                var networkConnectivityLevel = internetProfile ? internetProfile.getNetworkConnectivityLevel() : 0;
                //check we are online
                if (networkConnectivityLevel == 3) {
                    //add a query string to the path to make a unique URL and ensure we always get the latest version, not a cached version
                    var u = path + "?nocache=" + new Date().getTime();
                    var responseText;
                    try {
                        //request the file
                        WinJS.xhr({ url: u })
                            .then(function (request) {
                                //capture the response text
                                responseText = request.responseText;
                            }, function (err) { configErrorHandler(err, 1); })
                            .then(function () {
                                //create a file in local data, overwrite existing
                                return localFolder.createFileAsync(cachedFileName, Windows.Storage.CreationCollisionOption.replaceExisting)
                            }, function (err) { configErrorHandler(err, 1); })
                            .then(function (newFile) {
                                //write the response text to the new file
                                return Windows.Storage.FileIO.writeTextAsync(newFile, responseText)
                            }, function (err) { configErrorHandler(err, 1); })
                            .done(function () {
                                complete();
                            });
                    } catch (err) {
                        configErrorHandler(err.message, 3);
                    }
                }
                else {
                    complete();
                }
            });
        },

    };

    // Private methods
    filesConfigLoadHandler = function (filesConfigFile) {
        var cachedFilePath = "ms-appdata:///local/config.json";
        Windows.Storage.FileIO.readTextAsync(filesConfigFile)
            .then(getFilesConfigAsync)
            .then(function () {
                if (WAT.filesConfig.configJsonUri != "") {
                    //cache the hosted file locally
                    return WAT.cacheHostedFileAsync(WAT.filesConfig.configJsonUri, "config.json")
                }
            }, function (err) { configErrorHandler(err, 1); })
            .then(function () {
                if (WAT.filesConfig.configJsonUri != "") {
                    //verify that the file was cached
                    return WAT.isFileCachedAsync(cachedFilePath);
                }
            }, function (err) { configErrorHandler(err, 1); })
            .then(function (isValidFile) {
                if (isValidFile)
                    //update the WAT configFile to look at teh local data path rather than app package
                    WAT.options.configFile = cachedFilePath;
                return;
            }, function (err) { configErrorHandler(err, 1); })
            .done(loadConfigAsync, function (err) {
                configErrorHandler(err, 1);
            });
    };

    getFilesConfigAsync = function (configText) {
        return new WinJS.Promise(function (complete) {
            var savedHostURL = localStorage.getItem("savedHostURL") || 'no data';

            //parse the configText into the WAT object
            try {
                WAT.filesConfig = (savedHostURL && savedHostURL !== 'no data') ? { configJsonUri: savedHostURL } : JSON.parse(configText);
                complete();
            } catch (err) {
                configErrorHandler(err.message, 3);
                return;
            }
        });
    };

    loadConfigAsync = function () {
        //this is what was in the orginal WAT 1.1 which simply loads whatever config file is configuired in WAT.options.configFile. It could be the orginal app package one or a cached one in local data
        var uri = new Windows.Foundation.Uri(WAT.options.configFile);
        return loadManifestStylesAsync().then(function () {
            return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri)
                .then(
                    configLoadHandler,
                    function (err) {
                        configErrorHandler(err, 1);
                    }
                );
        })
    };

    loadManifestStylesAsync = function () {
        var uri = new Windows.Foundation.Uri("ms-appx:///AppxManifest.xml")
        return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri).then(function (file) {
            return Windows.Data.Xml.Dom.XmlDocument.loadFromFileAsync(file).then(function (xml) {
                WAT.styles = {};

                var visualElements = xml.selectSingleNodeNS(
                    "/x:Package/x:Applications/x:Application/m2:VisualElements",
                    "xmlns:x='http://schemas.microsoft.com/appx/2010/manifest' xmlns:m2='http://schemas.microsoft.com/appx/2013/manifest'");

                if (visualElements) {
                    var backgroundColor = visualElements.attributes.getNamedItem("BackgroundColor");
                    if (backgroundColor) {
                        WAT.styles.manifestBackgroundColor = backgroundColor.nodeValue;
                    }

                    var foregroundText = visualElements.attributes.getNamedItem("ForegroundText");
                    if (foregroundText) {
                        WAT.styles.manifestForegroundText = foregroundText.nodeValue;
                    }
                }
            });
        });
    };

    handleUncaughtErrors = function (e) {
        var alertMessage = "Sorry, but there was an error. Please contact us if the issue continues.",
            error = {
                message: (e.detail.errorMessage || e),
                url: e.detail.errorUrl,
                line: e.detail.errorLine,
                character: e.detail.errorCharacter
            };

        logger.error(error.message, error.url, error.line, error.character);

        if (WAT.config.errors && WAT.config.errors.showAlertOnError) {
            if (WAT.config.errors.alertMessage) {
                alertMessage = WAT.config.errors.alertMessage;
            }

            new Windows.UI.Popups.MessageDialog(alertMessage).showAsync();
        }

        if (WAT.config.errors && WAT.config.errors.redirectToErrorPage) {
            var url,
                baseUrl = "ms-appx-web:///",
                defaultErrorUrl = "template/error.html";

            if (WAT.config.errors.errorPageURL) {
                if (/^http/.test(WAT.config.errors.errorPageURL)) {
                    url = WAT.config.errors.errorPageURL;
                } else {
                    url = baseUrl + WAT.config.errors.errorPageURL;
                }

            } else {
                url = baseUrl + defaultErrorUrl;
            }

            utilities.findLanguageFileAsync(url)
                .then(function (langUrl) {
                    WAT.goToLocation(langUrl);
                });
        }

        // Indicate that we have handled the error so the app does not crash
        return true;
    };

    start = function (configText) {
        var namespace;
        //if we get a 404 or bad file read, we step out and run as if there is not config remote specified
        if (configText === 'undefined') {
            WAT.options.configFile = "ms-appx:///config/config.json";
            WAT.filesConfig.configJsonUri = "";
            loadConfigAsync();
            return;
        }

        if (modules["config"]) {
            configModule = modules["config"];
            configModule.start();
        }

        configModule.loadConfigAsync(configText)
            .then(function () {
                // Start the logger first
                if (modules["log"]) {
                    modules["log"].start();
                }

                logger.info("Starting application...");

                if (!WAT.config.baseURL && WAT.config.homeURL) {
                    WAT.config.baseURL = WAT.config.homeURL;
                }

                if (!WAT.config.baseURL) {
                    throw new WinJS.ErrorFromName('Invalid url', '');
                }

                WAT.config.loadTimeoutMs = (WAT.config.loadTimeoutMs || 10000);

                for (namespace in modules) {
                    // the logger is started first above
                    if (namespace !== "log") {
                        logger.log("Calling start on ", namespace);
                        modules[namespace].start();
                    }
                }

                // TODO: catch MSWebViewUnviewableContentIdentified

                WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", webViewLoaded);

                var superCacheConfig = WAT.config.offline.superCache;
                if (superCacheConfig && superCacheConfig.enabled !== false) {
                    WAT.options.webView.addEventListener("MSWebViewNavigationStarting", webViewNavigationStarting);

                    // initialize SuperCache configuration object
                    var config = new WatExtensions.SuperCache.Config.SuperCacheConfig();
                    config.proxyUri = superCacheConfig.proxyUri || "Auto";
                    config.isEnabled = superCacheConfig.enabled;
                    config.enableDynamicImageHandler = superCacheConfig.enableDynamicImageHandler;
                    config.enableRedirectWindowOpen = superCacheConfig.enableRedirectWindowOpen;
                    config.enableXhrInterceptor = superCacheConfig.enableXhrInterceptor;

                    // configure URL patterns that should not be handled by the SuperCache
                    if (superCacheConfig.bypassUrlPatterns) {
                        superCacheConfig.bypassUrlPatterns.forEach(function (item) {
                            config.bypassUrlPatterns.append(item);
                        });
                    }

                    // configure diagnostics tracing
                    var traceLevel = superCacheConfig.traceLevel ? superCacheConfig.traceLevel.toLowerCase() : "error";
                    switch (traceLevel) {
                        case "off": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.off; break;
                        case "error": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.error; break;
                        case "warning": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.warning; break;
                        case "info": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.info; break;
                        case "verbose": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.verbose; break;
                    }

                    // start the SuperCache web server
                    WatExtensions.SuperCacheManager.startAsync(new Windows.Foundation.Uri(WAT.config.baseURL), config)
                        .then(function () {

                            //// Umcomment the block below to handle and modify requests before resending them to the remote site
                            //WatExtensions.SuperCacheManager.onsendingrequest = function (args) {
                            //    logger.log("(OnSendingRequest) Sending request to:" + args.requestUri);
                            //};

                            //// Umcomment the block below to handle text responses received from the remote site before reaching the webview control
                            //WatExtensions.SuperCacheManager.ontextresponsereceived = function (args) {
                            //    logger.log("(OnTextResponseReceived) Response received from:" + args.requestUri);
                            //};

                            // When the requested page is not present in the cache
                            WatExtensions.SuperCacheManager.onofflinepageunavailable = function (args) {
                                if (WAT.config.offline.enabled) {
                                    var offline = WAT.getModule("offline");
                                    if (offline) {
                                        offline.forceOffline();
                                    }
                                }
                            };

                            WAT.goToLocation((secondaryPinLocation) ? secondaryPinLocation : WAT.config.baseURL);
                        },
                        function (e) {
                            logger.error(e.message);
                        });
                }
                else
                    WAT.goToLocation((secondaryPinLocation) ? secondaryPinLocation : WAT.config.baseURL);

                logger.info("...application initialized.");

        if (WAT.config.cortana && WAT.config.cortana.enabled) {
            initializeSpeechPhrases();
        }

        if (WAT.config.ratingReminder && WAT.config.ratingReminder.enabled) {
            // Rating remainder - Create the reminder helper object
            var rate = AppPromo.RateHelper();

            // Number of runs before remainder is presented
            rate.runsBeforeReminder = WAT.config.ratingReminder.runsBeforeReminder;
            rate.tryReminderAsync();
        }

                WAT.options.initCallback(null);

                // We must call processAll once to avoid UI creation problems
                WinJS.UI.processAll().then(function () {
                    // Back button
                    WinJS.Application.onbackclick = function (evt) {
                        var settings = WAT.getModule("settings");
                        if (settings) {
                            if (settings.navigateBack()) {
                                return true;
                            }
                        }

                        var nav = WAT.getModule("nav");
                        if (nav) {
                            if (nav.navigateBack()) {
                                return true;
                            }
                        }
                        return false;
                    };

                    // After ProcessAll Actions
                    for (namespace in modules) {
                        var actions = modules[namespace].afterProcessAllActions;

                        if (actions) {
                            for (var index = 0; index < actions.length; index++) {
                                actions[index]();
                            }
                        }
                    }
                });
            }, function (err) { configErrorHandler(err, 3); });
    };

    initializeSpeechPhrases = function () {
        var uri = new Windows.Foundation.Uri("ms-appx:///vcd.xml");

        //WinJS.xhr({
        //    url: "ms-appx:///vcd.xml", responseType: "xml"
        //}).done(
        //function (result) {
        //    var data = result.responseXML;
        //    var commandPrefix = data.getElementsByTagName("CommandPrefix")[0].childNodes[0];
        //    if (commandPrefix.nodeValue == "WAT") {
        //        var messageDialog = new Windows.UI.Popups.MessageDialog("Please change CommandPrefix in vcd.xml");
        //        messageDialog.showAsync();
        //    }
        //});

        var storageFile =
            Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri).then(
            // Success function.
            function (vcd) {
                Windows.Media.SpeechRecognition.VoiceCommandManager.installCommandSetsFromStorageFileAsync(vcd);

                var installedCommandSets = Windows.Media.SpeechRecognition.VoiceCommandManager.installedCommandSets;
                if (installedCommandSets.hasKey("examplevcd")) {
                    var commandSet = installedCommandSets.lookup("examplevcd");
                    commandSet.setPhraseListAsync("options", phraseList);
                }
            });
    }

    configLoadHandler = function (file) {
        Windows.Storage.FileIO.readTextAsync(file)
            .then(
                start,
                function (err) { configErrorHandler(err, 2); }
            );
    };

    configErrorHandler = function (err, i) {
        i = (i || 1);
        logger.error("Error while loading config (" + WAT.options.configFile + "): ", err);

        WAT.options.initCallback("Unable to initialize application config file (" + i + ").");
    };

    webViewLoaded = function () {
        clearTimeout(loadTimeout);
        loadTimeout = null;
    };

    webViewNavigationStarting = function (e) {
        var args = new WatExtensions.SuperCache.NavigatingEventArgs(e.uri);
        if (WatExtensions.SuperCacheManager.onNavigating(args)) {
            e.preventDefault();
            WAT.options.webView.navigate(args.targetUri);
        }
    };

    WinJS.Application.onunload = function (args) {
        if (WAT.config.offline && WAT.config.offline.superCache && WAT.config.offline.superCache.enabled !== false)
            WatExtensions.SuperCacheManager.stopAsync();
    };

})(window.winJS);