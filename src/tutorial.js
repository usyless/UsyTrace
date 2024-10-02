(() => {
    'use strict';

    const TUTORIAL_VERSION = 1;
    const USER_TUTORIAL_VERSION = (() => {
        try {return parseInt(window.localStorage.getItem('USER_TUTORIAL_VERSION') || 0);} catch {return 0;}
    })();

    const TUTORIAL_PAGES = [{
        header: 'Welcome to UsyTrace',
        body: `This is a website made for you to trace data from images of frequency response graphs.
The next few pages of the tutorial will show all of the functionality.
This tutorial will be updated occasionally, and when it is it will be shown to you upon visiting UsyTrace again, in which case I'd recommend reading it again!`
    }, {
        header: 'Tracing',
        body: `Auto Trace: Tries to automatically select a line in the image, may fail, applied automatically upon image import
Select Path: Traces to the right of the point you click on the image, can complete a trace by starting from the left side of the frequency response and clicking to the right if it misses a part
Add Point: Add a single point to the trace manually, useful for situations where Select Path or Auto Trace Fails
Undo: Goes back to the previous trace step, saves add point, tracing, and clearing history
Clear Path: Clears the current trace on screen, can go back using Undo`
    }, {
        header: 'Exporting',
        body: `Align the two sets of "High" and "Low" lines with a given value in their axis, the specific value does not matter, then input the respective values into "Higher SPL", "Lower SPL", and adjust the Frequency values if not using 20Hz and 20000Hz
Adjust the minimum and maximum exported value with "Minimum Frequency" and "Maximum Frequency", as well as this, you can adjust the delimitation and points per octave (PPO) of the exported data in the "Trace Settings"
Then "Export Trace" will give you the result`
    }, {
        header: 'Settings',
        body: `Buttons Snap To Axis: whether the buttons underneath the Export values will attempt to snap the lines to their axis, or to enable smooth manual movement
Colour Tolerance: Raise if line is not being detected, Lower if line is jagged or detecting multiple lines`
    }, {
        header: 'Miscellaneous',
        body: `You can drop, or import any amount of images you like into the site, other than with pasting, as that only supports one image at a time.
Loaded images show in the image queue on the bottom, and can be removed by right clicking them (long hold on mobile) or pressing remove`
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

        const mainText = document.createElement('h4');
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
        window.localStorage.setItem('USER_TUTORIAL_VERSION', TUTORIAL_VERSION.toString());
    }

    document.getElementById('tutorial').addEventListener('click', showTutorial);
})();