(() => {
    'use strict';

    const TUTORIAL_VERSION = 1;
    const USER_TUTORIAL_VERSION = (() => {
        try {return parseInt(window.localStorage.getItem('USER_TUTORIAL_VERSION') ?? 0);} catch {return 0;}
    })();

    const TUTORIAL_PAGES = [{
        header: 'Welcome to UsyTrace',
        body: `<h2>Here you can trace frequency responses from images</h2>

All you need to know, as well as keybindings are on the next few pages`
    }, {
        header: 'Tracing',
        body: `<h3>Auto Trace (a)</h3>
Tries to automatically select a line in the image, may fail, applied automatically upon image import
        
<h3>Select Path (t)</h3>
Traces to the right of the point you click on the image, can complete a trace by starting from the left side of the frequency response and clicking to the right if it misses a part

<h3>Add Point (p)</h3>
Add a single point to the trace manually, useful for situations where Select Path or Auto Trace Fails

<h3>Undo (Ctrl + z)</h3>
Goes back to the previous trace step, saves add point, tracing, and clearing history

<h3>Clear Path (Backspace)</h3>
Clears the current trace on screen, can go back using Undo`
    }, {
        header: 'Exporting',
        body: `Align <b>High</b> and <b>Low</b> lines with given values in their respective axis, then input the respective values into <b>Higher SPL</b>, <b>Lower SPL</b>, <b>Higher Frequency</b> and <b>Lower Frequency</b>.

The lines can be moved with the arrow keys, defaulting to the <b>High</b> line for each axis, but can control the <b>Low</b> line by holding <b>Shift</b>

<h3>Trace Settings</h3>     
Adjust the <b>Minimum Exported Frequency</b>, <b>Maximum Exported Frequency</b>, <b>Points Per Octave of the exported data</b>, and <b>the delimitation of the exported data</b>

Then <b>Export Trace</b> will give you the result`
    }, {
        header: 'Settings',
        body: `<h3>Buttons Snap To Axis</h3>
whether the buttons underneath the Export values will attempt to snap the lines to their axis, or to enable smooth manual movement
        
<h3>Colour Tolerance</h3>
Raise if line is not being detected, Lower if line is jagged or detecting multiple lines`
    }, {
        header: 'Miscellaneous',
        body: `You can <b>drop</b>, or <b>choose any amount of images</b> you like into the site, other than with pasting, as that only supports one image at a time.
        
Loaded images show in the image queue on the bottom, and can be removed by right-clicking them (long hold on mobile), pressing <b>Remove</b> or pressing the <b>Delete</b> key on your keyboard`
    }];
    let CURRENT_PAGE = 0;

    if (TUTORIAL_VERSION !== USER_TUTORIAL_VERSION) showTutorial();

    function showTutorial() {
        CURRENT_PAGE = 0;
        const center_div = document.createElement('div'),
            main_div = document.createElement('div'),
            inner_div = document.createElement('div'),
            text_div = document.createElement('div'),
            buttons_div = document.createElement('div');

        center_div.setAttribute('usy-overlay', '');
        center_div.classList.add('fullscreen', 'blur');
        main_div.classList.add('popupOuter', 'fixedSize');
        inner_div.classList.add('popupInner', 'fixedSize');
        buttons_div.classList.add('popupButtons');
        text_div.classList.add('popupText');

        center_div.appendChild(main_div);
        main_div.appendChild(inner_div);

        // Main Page
        const headContainer = document.createElement('div'),
            head = document.createElement('h1'),
            exit = document.createElement('button');
        headContainer.classList.add('headContainer');
        exit.classList.add('standardButton');
        exit.textContent = '𐌢';
        exit.addEventListener('click', hideTutorial);

        headContainer.append(head, exit);
        inner_div.append(headContainer, text_div, buttons_div);

        const mainText = document.createElement('p');
        text_div.append(mainText);

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
            const data = TUTORIAL_PAGES[CURRENT_PAGE] ?? TUTORIAL_PAGES[0];
            head.textContent = data['header'];
            mainText.innerHTML = data['body'];
        }

        center_div.addEventListener('click', () => {
                Popups.clearPopups();
        });
        main_div.addEventListener('click', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });

        buttons_div.append(previousPage, nextPage);

        document.body.appendChild(center_div);
    }

    function hideTutorial() {
        Popups.clearPopups();
        window.localStorage.setItem('USER_TUTORIAL_VERSION', TUTORIAL_VERSION.toString());
    }

    document.getElementById('tutorial').addEventListener('click', showTutorial);
})();