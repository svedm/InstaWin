(function (WAT) {
    "use strict";

    // Public API
    var self = {

        start: function () {
        }

    };

    // Module Registration
    WAT.registerModule("environment", self);

    // Will include XBOX at some point
    WAT.environment = {
        isWindows: true,
        isWindowsPhone: false
    };

})(window.WAT);