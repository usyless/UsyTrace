(() => {
    'use strict';

    const TUTORIAL_VERSION = 1;
    const USER_TUTORIAL_VERSION = (() => {
        try {return parseInt(window.localStorage.getItem('USER_TUTORIAL_VERSION') || 0);} catch {return 0;}
    })();

    if (TUTORIAL_VERSION > USER_TUTORIAL_VERSION) {
        showTutorial();
        // window.localStorage.setItem('USER_TUTORIAL_VERSION', TUTORIAL_VERSION.toString());
    }

    function showTutorial() {
        const center_div = document.createElement('div'),
            main_div = document.createElement('div'),
            inner_div = document.createElement('div'),
            text_div = document.createElement('div'),
            buttons_div = document.createElement('div');

        center_div.setAttribute('usy-overlay', '');
        center_div.classList.add('fullscreen');
        main_div.classList.add('popupOuter');
        inner_div.classList.add('popupInner');
        buttons_div.classList.add('popupButtons');
        text_div.classList.add('popupText');

        center_div.appendChild(main_div);
        main_div.appendChild(inner_div);
        inner_div.append(text_div, buttons_div);

        // Main Page
        const headContainer = document.createElement('div'),
            head = document.createElement('h1'),
            exit = document.createElement('button');
        headContainer.classList.add('headContainer');
        exit.classList.add('standardButton');
        exit.textContent = '𐌢';
        exit.addEventListener('click', hideTutorial);
        head.textContent = 'Welcome to UsyTrace!';

        headContainer.append(head, exit);
        text_div.appendChild(headContainer);

        // Buttons
        const nextPage = document.createElement('button'),
            previousPage = document.createElement('button');
        nextPage.classList.add('standardButton');
        previousPage.classList.add('standardButton');
        nextPage.textContent = 'Begin Tutorial';
        previousPage.disabled = true;

        buttons_div.append(previousPage, nextPage);

        document.body.appendChild(Popups.createOverlay());
        document.body.appendChild(center_div);
    }

    function hideTutorial() {
        Popups.clearPopups();
    }

    document.getElementById('tutorial').addEventListener('click', showTutorial);
})();