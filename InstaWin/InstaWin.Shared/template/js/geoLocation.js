(function (WAT) {
    "use strict";

    var logger, utilities;

    // Public API
    var self = {

        enabled: false,

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            self.enabled = WAT.config.geoLocation && WAT.config.geoLocation.enabled;
            if (!self.enabled) { return; }

            if (WAT.getModule("utilities")) {
                utilities = WAT.getModule("utilities");
            }

            // Keep it to use when webview security restrictions will be relaxed
            //WAT.options.webView.addEventListener("MSWebViewScriptNotify", function (e) {
            //    var order = JSON.parse(e.value);

            //    switch (order.type) {
            //        case "GEO": // geo location interceptor
            //            geoLocationInterceptor.Intercept(order, WAT.options.webView);
            //            break;
            //    }
            //});

            WAT.options.webView.addEventListener('MSWebViewContentLoading', function (e) {
                utilities.readScript("ms-appx:///template/js/geo/injectedGeoLocation.script").then(function (geoLocationScript) {

                    navigator.geolocation.getCurrentPosition(function (position) {

                        geoLocationScript = geoLocationScript.replace("###LOCLAT###", position.coords.latitude);
                        geoLocationScript = geoLocationScript.replace("###LOCLONG###", position.coords.longitude);

                        var asyncOp = WAT.options.webView.invokeScriptAsync('eval', geoLocationScript);
                        asyncOp.start();
                    });
                });
            });
        }
    };

    // Module Registration
    WAT.registerModule("geo", self);

})(window.WAT);