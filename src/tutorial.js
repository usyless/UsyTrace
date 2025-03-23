'use strict';

import {createPopup, clearPopups} from "./popups.js";

const TUTORIAL_VERSION = 2;
const USER_TUTORIAL_VERSION = (() => {
    try {
        return parseInt(window.localStorage.getItem('USER_TUTORIAL_VERSION') ?? 0, 10);
    } catch {
        return 0;
    }
})();

const TUTORIAL_PAGES = [{
    /** @export */
    header: 'Welcome to UsyTrace',
    /** @export */
    body: `<h2>Here you can trace frequency responses from images</h2>

All you need to know, as well as keybindings are on the next few pages`
}, {
    /** @export */
    header: 'Tracing',
    /** @export */
    body: `<h3>Auto Trace (a)</h3>
Tries to automatically select a line in the image, may fail, applied automatically upon image import
    
<h3>Select Path (t)</h3>
Traces to the right of the point you click on the image, can complete a trace by starting from the left side of the frequency response and clicking to the right if it misses a part

<h3>Add Point (p)</h3>
Add a single point to the trace manually, useful for situations where Select Path or Auto Trace Fails

<h3>Smooth Trace (s)</h3>
Smooths out sudden bumps in the traced line, good for if the original image is bad and the traced line is inconsistent

<h3>Undo (Ctrl + z)</h3>
Goes back to the previous trace step, saves add point, tracing, and clearing history

<h3>Redo (Ctrl + Shift + z)</h3>
Goes back to recently undone trace steps

<h3>Erase Region (e)</h3>
Select a region to erase a trace from by dragging a box around the area

<h3>Clear Path (Backspace)</h3>
Clears the current trace on screen, can go back using Undo`
}, {
    /** @export */
    header: 'Exporting',
    /** @export */
    body: `Align <b>High</b> and <b>Low</b> lines with given values in their respective axis, then input the respective values into <b>Higher SPL</b>, <b>Lower SPL</b>, <b>Higher Frequency</b> and <b>Lower Frequency</b>.

The lines can be moved with the arrow keys, defaulting to the <b>High</b> line for each axis, but can control the <b>Low</b> line by holding <b>Shift</b>

<h3>Trace Settings</h3>     
Adjust the <b>Minimum Exported Frequency</b>, <b>Maximum Exported Frequency</b>, <b>Points Per Octave of the exported data</b>, and <b>the delimitation of the exported data</b>

Then <b>Export Trace</b> will give you the result`
}, {
    /** @export */
    header: 'Settings',
    /** @export */
    body: `<h3>Buttons Snap To Axis</h3>
whether the buttons underneath the Export values will attempt to snap the lines to their axis, or to enable smooth manual movement
    
<h3>Colour Tolerance</h3>
Raise if line is not being detected, Lower if line is jagged or detecting multiple lines`
}, {
    /** @export */
    header: 'Miscellaneous',
    /** @export */
    body: `You can <b>drop</b>, or <b>choose any amount of images</b> you like into the site, other than with pasting, as that only supports one image at a time.
    
Loaded images show in the image queue on the bottom, and can be removed by right-clicking them (long hold on mobile), pressing <b>Remove</b> or pressing the <b>Delete</b> key on your keyboard`
}];
let CURRENT_PAGE = 0;

if (TUTORIAL_VERSION !== USER_TUTORIAL_VERSION) showTutorial();

function showTutorial() {
    CURRENT_PAGE = 0;
    const text_div = document.createElement('div'),
        buttons_div = document.createElement('div');

    buttons_div.classList.add('popupButtons');
    text_div.classList.add('popupText');

    // Main Page
    const headContainer = document.createElement('div'),
        head = document.createElement('h1'),
        exit = document.createElement('button');
    headContainer.classList.add('headContainer');
    exit.classList.add('standardButton');
    exit.textContent = '𐌢';
    exit.addEventListener('click', clearPopups);

    headContainer.append(head, exit);

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

    buttons_div.append(previousPage, nextPage);

    createPopup([headContainer, text_div, buttons_div], {
        buttons: buttons_div,
        classes: ['fixedSize'],
        onclose: finishTutorial
    });
}

function finishTutorial() {
    window.localStorage.setItem('USER_TUTORIAL_VERSION', TUTORIAL_VERSION.toString());
}

document.getElementById('tutorial').addEventListener('click', showTutorial);
