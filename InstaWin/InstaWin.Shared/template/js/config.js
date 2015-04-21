(function (WAT) {
    "use strict";

    // Public API
    var self = {
        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            if (WAT.getModule("utilities")) {
                utilities = WAT.getModule("utilities");
            }

            if (moduleStarted) {
                logger.warn("[config] Module already started; skipping...")
                return;
            }

            moduleStarted = true;
            logger.log("[config] Starting module...");
        },

        loadConfigAsync: function (configText) {
            // Parse config.json string
            return WinJS.Promise.as(JSON.parse(configText))
            // Check whether the content is a Web App Manifest
            .then(function (parsedConfig) {
                parsedConfig.isWebApplicationManifest = isWebApplicationManifest(parsedConfig);
                return WinJS.Promise.as(parsedConfig);
            })
            // Apply default values configured in the manifest schema
            .then(function (parsedConfig) { return parsedConfig.isWebApplicationManifest ? 
                applyWebApplicationManifestDefaultValuesAsync(parsedConfig):
                WinJS.Promise.as(parsedConfig); })
            // Translate Web App Manifest into old plain config object
            .then(function (parsedConfig) { return parsedConfig.isWebApplicationManifest ? 
                WinJS.Promise.as(translateWebApplicationManifest(parsedConfig)):
                WinJS.Promise.as(parsedConfig);
            })
            // Assign parsed config to global WAT.config property
            .then(function (parsedConfig) { return WinJS.Promise.as(WAT.config = parsedConfig); })
            // Look for current culture config and translate localizable settings
            .then(function (parsedConfig) { return loadLanguageConfigAsync(); });
        }
    },

        // Private variable declarations
        logger,
        utilities,
        moduleStarted = false,
        otherVar,

        // Private methods
        isWebApplicationManifest = function (config, ignoreStartUrl) {
            if (config && (config.hasOwnProperty("start_url") || ignoreStartUrl)) {
                for (var prop in config) {
                    if (!isWebApplicationManifestProperty(prop)) {
                        throw new WinJS.ErrorFromName('Invalid configuration structure', '');
                    }
                }

                return true;
            }

            return false;
        },

        isWebApplicationManifestProperty = function (property) {
            var validProperties = ["start_url", "name", "short_name", "orientation", "display", "icons", "$schema"];

            return property.indexOf("wat_") > -1 || validProperties.filter(function (item) { return item === property; }).length !== 0;
        },

        translateWebApplicationManifest = function (config) {
            var newConfig = {};

            for (var prop in config) {
                if (prop.indexOf("wat_") > -1) {
                    newConfig[prop.replace("wat_", "")] = config[prop];
                }
            }

            if (typeof config.start_url === 'string') {
                newConfig.homeURL = config.start_url.trim();

                if (WAT.filesConfig.configJsonUri) {
                    var parser = document.createElement("a");
                    parser.href = newConfig.homeURL;

                    if (!/https?/.test(parser.protocol)) {
                        // the start_url is a relative path so we need to add the hostname 
                        parser = document.createElement("a");
                        parser.href = WAT.filesConfig.configJsonUri;
                        var port = parser.port ? ':' + parser.port : '';
                        if ((newConfig.homeURL.indexOf('/') !== 0) && (newConfig.homeURL.indexOf('\\') !== 0)) {
                            newConfig.homeURL = parser.protocol + '//' + parser.hostname + port + '/' + newConfig.homeURL;
                        } else {
                            newConfig.homeURL = parser.protocol + '//' + parser.hostname + port + newConfig.homeURL;
                        }
                    }
                }
            }

            if (typeof config.name === 'string') {
                newConfig.displayName = config.name.trim();
            }

            if (typeof config.orientation === 'string') {
                newConfig.orientation = config.orientation.trim();
            }

            return newConfig;
        },

        applyWebApplicationManifestDefaultValuesAsync = function (config) {
            if (config["$schema"]) {
                var filename = "ms-appx://" + config["$schema"];
                var uri = new Windows.Foundation.Uri(filename);
                return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri)
                    .then(function (file) { return Windows.Storage.FileIO.readTextAsync(file); })
                    .then(function (text) { return WinJS.Promise.as(JSON.parse(text)); })
                    .then(function (manifest) { return applyConfigDefaultValuesHandlerAsync(config, manifest); });
            } else {
                return WinJS.Promise.wrap(config);
            }
        },

        // Uses recursive method to apply default values to config object
        applyConfigDefaultValuesHandlerAsync = function (config, manifest) {
            if (manifest.properties) {
                updateDefaultProperty(manifest, manifest.properties, config);
            }

            return WinJS.Promise.wrap(config);
        },

        // Recursively applies default values into a target object
        updateDefaultProperty = function (manifest, sourceObject, targetObject) {

            // Check for source and target objects. This condition stops recursion
            if (sourceObject && targetObject) {
                for (var propertyName in sourceObject) {
                    var property = getManifestProperty(manifest, sourceObject[propertyName]);
                    if (property) {
                        if (property.default && !targetObject.hasOwnProperty(propertyName)) {
                            targetObject[propertyName] = property.default;
                        }

                        // Recursively update objects. In Manifest all props are included in the properties array
                        updateDefaultProperty(manifest, property.properties, targetObject[propertyName]);
                    }
                }
            }
        },

        // Retrieves the referenced manifest property from declarations or the property itself if no referenced property
        getManifestProperty = function (manifest, property) {
            if (property["$ref"]) {
                // $ref property in the form "#/declarations/property
                var sections = property["$ref"].split("/");
                for (var i in sections) {
                    if (sections[i] == "#") property = manifest;
                    else property = property[sections[i]];
                }
            }

            return property;
        },

        loadLanguageConfigAsync = function () {
            return utilities.findLanguageFileAsync(WAT.options.configFile)
                .then(function (langFile) {
                    if (langFile != WAT.options.configFile) {
                        var langUri = new Windows.Foundation.Uri(langFile);
                        return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(langUri)
                            .then(
                                updateConfigHandlerAsync,
                                function (err) {
                                    throw "Cannot open localized config file: " + langFile;
                                });
                    }
                });
        },

        updateConfigHandlerAsync = function (file) {
            return Windows.Storage.FileIO.readTextAsync(file)
                .then(
                    function (configText) {
                        if (configText === 'undefined') {
                            return;
                        }
                        try {
                            var parsedConfig = JSON.parse(configText);

                            if (isWebApplicationManifest(parsedConfig,true)) {
                                parsedConfig = translateWebApplicationManifest(parsedConfig);
                            }

                            updateObject(WAT.config, parsedConfig);
                        } catch (err) {
                            throw "error updating localized configuration: " + err.message;
                        }
                    });
        },

        updateObject = function (target, source) {
            for (var property in source) {
                if (target.hasOwnProperty(property)) {
                    updateProperty(target, source, property);
                }
            }
        },

        updateProperty = function (target, source, propName) {
            if (typeof source[propName] === 'array') {
                for (var i = 0; i < source[propName]; i++) {
                    updateProperty(target[propName][i], source[propName][i]);
                }
            }
            else if (typeof source[propName] === 'object') {
                updateObject(target[propName], source[propName]);
            }
            else {
                target[propName] = source[propName];
            }
        };

    // Module Registration
    WAT.registerModule("config", self);

})(window.WAT);