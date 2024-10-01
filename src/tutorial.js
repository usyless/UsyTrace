(() => {
    'use strict';

    const TUTORIAL_VERSION = 2;
    const USER_TUTORIAL_VERSION = (() => {
        try {return parseInt(window.localStorage.getItem('USER_TUTORIAL_VERSION') || 0);} catch {return 0;}
    })();

    const TUTORIAL_PAGES = [{
        header: 'Welcome to UsyTrace',
        body: `This is a website made for you to trace data from images of frequency response graphs.
The next few pages of the tutorial will show all of the functionality.
This tutorial will be updated occasionally, and when it is it will be shown to you upon visiting UsyTrace again, in which case I'd recommend reading it again!`
    }];
    let CURRENT_PAGE = 0;

    if (TUTORIAL_VERSION !== USER_TUTORIAL_VERSION) showTutorial();

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

        headContainer.append(head, exit);

        const mainText = document.createElement('p');
        text_div.append(headContainer, mainText);

        // Buttons
        const nextPage = document.createElement('button'),
            previousPage = document.createElement('button');
        nextPage.classList.add('standardButton');
        previousPage.classList.add('standardButton');

        nextPage.addEventListener('click', () => {
            if (CURRENT_PAGE >= TUTORIAL_PAGES.length - 1) exit.click();
            ++CURRENT_PAGE;
            updateButtons();
        });
        previousPage.addEventListener('click', () => {
            --CURRENT_PAGE;
            updateButtons();
        });
        updateButtons();
        loadPage();

        function updateButtons() {
            if (CURRENT_PAGE >= TUTORIAL_PAGES.length - 1) nextPage.textContent = "End Tutorial";
            else if (CURRENT_PAGE <= 0) {
                nextPage.textContent = "Begin Tutorial";
                previousPage.disabled = true;
                previousPage.textContent = "";
            } else {
                nextPage.textContent = "Next";
                previousPage.disabled = false;
                previousPage.textContent = "Previous";
            }
            loadPage();
        }

        function loadPage() {
            const data = TUTORIAL_PAGES[CURRENT_PAGE] || TUTORIAL_PAGES[0];
            head.textContent = data['header'];
            mainText.textContent = data['body'];
        }

        buttons_div.append(previousPage, nextPage);

        document.body.appendChild(Popups.createOverlay());
        document.body.appendChild(center_div);
    }

    function hideTutorial() {
        CURRENT_PAGE = 0;
        Popups.clearPopups();
        window.localStorage.setItem('USER_TUTORIAL_VERSION', TUTORIAL_VERSION.toString())
    }

    document.getElementById('tutorial').addEventListener('click', showTutorial);
})();