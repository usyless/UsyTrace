(() => {
    'use strict';

    const TUTORIAL_VERSION = 1;
    const USER_TUTORIAL_VERSION = (() => {
        try {return parseInt(window.localStorage.getItem('USER_TUTORIAL_VERSION') || 0);} catch {return 0;}
    })();

    if (TUTORIAL_VERSION > USER_TUTORIAL_VERSION) {
        // TODO: the actual tutorial
        // window.localStorage.setItem('USER_TUTORIAL_VERSION', TUTORIAL_VERSION.toString());
    }
})();