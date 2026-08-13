'use strict';

import { state } from "./state.js";

const TUTORIAL_VERSION = 3;
const USER_TUTORIAL_VERSION = (() => {
    try {
        return parseInt(window.localStorage.getItem('USER_TUTORIAL_VERSION') ?? 0, 10);
    } catch {
        return 0;
    }
})();

const VIEWPORT_MARGIN = 12; // matches --spacing-largest
const SPOTLIGHT_PADDING = 6;
const TOOLTIP_GAP = 12;
const SWAP_DURATION = 140; // matches the .is-swapping transition
const WELCOME_FADE = 220; // matches the .is-leaving transition
const FALLBACK_PLACEMENTS = ['right', 'left', 'bottom', 'top'];

const strong = (text) => ({strong: text});

const tutorialSteps = [
    {
        target: '#traceButtons',
        placement: 'right',
        header: 'Tracing',
        blocks: [
            {
                heading: 'Auto Trace (a)',
                body: 'Finds a line in the image on its own. It runs once when you load an image (and smooths), and you can run it again at any point.'
            },
            {
                heading: 'Select Path (t)',
                body: 'Click a point on the image to trace the line to the right of it. Each run stacks on top of the current trace.'
            },
            {
                heading: 'Add Point (p)',
                body: 'Place a single point by hand, to fill in a gap the automatic passes missed.'
            },
            {
                heading: 'Erase Region (e)',
                body: 'Drag a box across the image to erase that part of the trace.'
            },
            {
                heading: 'Fixing mistakes',
                body: ['Smooth Trace (s) evens out a jagged line. Undo and redo are ', strong('Ctrl + Z'),
                    ' and ', strong('Ctrl + Shift + Z'), '. Backspace clears the trace, and can be undone.']
            }
        ]
    },
    {
        target: '#buttonSection',
        placement: 'right',
        header: 'Exporting',
        blocks: [
            {
                body: ['Line the ', strong('High'), ' and ', strong('Low'),
                    ' guides up with values you can read off each axis, then type those values in. UsyTrace uses them to turn pixels into frequency and SPL.']
            },
            {
                heading: 'Moving the guides',
                body: ['Use the arrow buttons or the arrow keys. Hold ', strong('Shift'), ' for the Low guide, or ',
                    strong('Ctrl'), ' to offset the whole trace instead. Line/Offset Move Speed sets how far one press travels.']
            },
            {
                heading: 'Export Trace',
                body: 'Writes the trace out as a csv file, once all four axis values are filled in.'
            },
            {
                heading: 'Buttons snap to axis',
                body: 'With this on, the arrow buttons under each value jump the guide straight to the nearest axis line found in the image instead of stepping by a fixed amount.'
            },
        ]
    },
    {
        target: '#traceSettings',
        placement: 'right',
        header: 'Trace Settings',
        blocks: [
            {
                heading: 'Trace Algorithm',
                body: 'Whether to use the regular or the new experimental algorithm for tracing, they both have their advantages and disadvtnages, colour tolerance is disabled in the experimental one.'
            },
            {
                heading: 'Colour Tolerance',
                body: 'How far a pixel may drift from the line colour and still count as part of the line. Raise it when the trace stops short, lower it when the trace jumps onto a neighbouring line.'
            }
        ]
    },
    {
        target: '#exportSettings',
        placement: 'right',
        header: 'Export Settings',
        blocks: [
            {
                heading: 'Export settings',
                body: 'Points Per Octave sets the resolution of the exported data, Delimitation picks tab or space between columns, and the frequency range limits what gets written out.'
            },
            {
                heading: 'Export Compensation',
                body: 'Applies the selected compensation to make a compensated graph a raw graph, given that the target is the same'
            }
        ]
    },
    {
        target: '#imageQueueContainer',
        placement: 'top',
        header: 'Images',
        blocks: [
            {
                body: ['Drop images anywhere on the page, paste them with ', strong('Ctrl + V'),
                    ', or use Load from files. You can load as many at once as you like.']
            },
            {
                heading: 'Image queue',
                body: ['Every loaded image sits in the bar along the bottom, and each one keeps its own trace. Click one to switch to it, press ',
                    strong('h'), ' to hide the bar, or ', strong('Delete'), ' to remove the selected image.']
            },
            {
                heading: 'Image Editing (Ctrl + E)',
                body: 'Crop the image and apply filters before tracing. Raising the contrast, or inverting a dark screenshot, often makes a line far easier to detect.'
            }
        ]
    }
];

let currentStep = -1;
let running = false;
let overlay = null, scrim = null, spotlight = null, tooltip = null, tooltipContent = null, primaryButton = null;
let swapTimer = null, instantTimer = null, welcomeTimer = null;
let previouslyFocused = null;
let boundListeners = [];

if (TUTORIAL_VERSION !== USER_TUTORIAL_VERSION) startTutorial();

document.getElementById('tutorial').addEventListener('click', startTutorial);

/**
 * @param {string} tag
 * @param {?string=} className space separated class names
 * @param {string=} text
 */
function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.classList.add(...className.split(' '));
    if (text != null) el.textContent = text;
    return el;
}

function button(label, className, onClick) {
    const b = element('button', className, label);
    b.addEventListener('click', onClick);
    return b;
}

function clear(el) {
    while (el.firstChild) el.firstChild.remove();
}

function paragraph(body) {
    const p = element('p');
    for (const part of (Array.isArray(body) ? body : [body])) {
        if (typeof part === 'string') p.appendChild(document.createTextNode(part));
        else p.appendChild(element('b', null, part.strong));
    }
    return p;
}

function startTutorial() {
    if (running) return;
    running = true;
    currentStep = -1;
    previouslyFocused = document.activeElement;

    blockPage();
    buildWelcome();
}

function endTutorial() {
    if (!running) return;
    running = false;
    currentStep = -1;

    clearTimeout(swapTimer);
    clearTimeout(instantTimer);
    clearTimeout(welcomeTimer);

    for (const el of [overlay, scrim, spotlight, tooltip]) el?.remove();
    overlay = scrim = spotlight = tooltip = tooltipContent = primaryButton = null;

    unblockPage();

    try {
        window.localStorage.setItem('USER_TUTORIAL_VERSION', TUTORIAL_VERSION.toString());
    } catch {}

    if (previouslyFocused?.isConnected) previouslyFocused.focus();
    previouslyFocused = null;
}

function buildWelcome() {
    scrim = element('div');
    scrim.id = 'tutorial-scrim';
    scrim.setAttribute('aria-hidden', 'true');

    overlay = element('div', 'fullscreen blur');
    overlay.id = 'tutorial-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Welcome to UsyTrace');

    const welcome = element('div', 'tutorialWelcome');

    const logo = element('img', 'tutorialWelcomeLogo');
    logo.src = './favicon.svg';
    logo.alt = '';
    logo.draggable = false;

    const buttons = element('div', 'popupButtons tutorialWelcomeButtons');
    buttons.append(
        button('Skip', 'standardButton', endTutorial),
        button('Start tutorial', 'standardButton', () => showStep(0))
    );

    welcome.append(
        logo,
        element('h1', null, 'Welcome to UsyTrace'),
        element('p', null, 'Trace a frequency response from an image, then export it. This runs through tracing, exporting, and the settings worth knowing about. (It\'s actually good this time)'),
        buttons
    );

    overlay.appendChild(welcome);
    document.body.append(scrim, overlay);
    focusFirst();
}

function dismissWelcome() {
    if (!overlay || overlay.classList.contains('is-leaving')) return;
    const leaving = overlay;
    leaving.classList.add('is-leaving');
    welcomeTimer = setTimeout(() => {
        leaving.remove();
        if (overlay === leaving) overlay = null;
    }, WELCOME_FADE);
}

function buildStepElements() {
    if (spotlight) return;

    spotlight = element('div');
    spotlight.id = 'tutorial-spotlight';
    spotlight.setAttribute('aria-hidden', 'true');

    tooltip = element('div', 'is-swapping');
    tooltip.id = 'tutorial-tooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-modal', 'true');

    tooltipContent = element('div', 'tutorialContent');
    tooltip.appendChild(tooltipContent);

    document.body.append(spotlight, tooltip);
}

function resolveStep(index, direction) {
    while (index >= 0 && index < tutorialSteps.length) {
        if (document.querySelector(tutorialSteps[index].target)) return index;
        index += direction;
    }
    return -1;
}

function targetRect() {
    const step = tutorialSteps[currentStep];
    const target = step && document.querySelector(step.target);
    return target ? target.getBoundingClientRect() : null;
}

function showStep(index) {
    const first = currentStep < 0;
    currentStep = index;

    dismissWelcome();
    buildStepElements();

    const target = document.querySelector(tutorialSteps[index].target);
    if (!target) return nextStep();

    target.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
    const rect = target.getBoundingClientRect();

    if (first) spotlight.classList.add('is-instant');
    placeSpotlight(rect);

    clearTimeout(swapTimer);
    if (first) {
        renderStep();
        placeTooltip(rect);
        requestAnimationFrame(() => {
            spotlight?.classList.remove('is-instant');
            tooltip?.classList.remove('is-swapping');
            focusPrimary();
        });
    } else {
        tooltip.classList.add('is-swapping');
        swapTimer = setTimeout(() => {
            const current = targetRect();
            if (!current) return endTutorial();
            renderStep();
            placeTooltip(current);
            tooltip.classList.remove('is-swapping');
            focusPrimary();
        }, SWAP_DURATION);
    }
}

function renderStep() {
    const step = tutorialSteps[currentStep];
    const isLast = currentStep === tutorialSteps.length - 1;

    clear(tooltipContent);

    const head = element('div', 'headContainer');
    head.append(
        element('h2', null, step.header),
        element('span', 'tutorialProgress', `${currentStep + 1} of ${tutorialSteps.length}`)
    );

    const text = element('div', 'tutorialText');
    for (const block of step.blocks) {
        const wrapper = element('div', 'tutorialBlock');
        if (block.heading) wrapper.appendChild(element('h3', null, block.heading));
        wrapper.appendChild(paragraph(block.body));
        text.appendChild(wrapper);
    }

    const back = button('Back', 'standardButton', previousStep);
    back.disabled = resolveStep(currentStep - 1, -1) < 0;
    primaryButton = button(isLast ? 'Finish' : 'Next', 'standardButton', isLast ? endTutorial : nextStep);

    const controls = element('div', 'popupButtons');
    controls.append(back, primaryButton);

    const footer = element('div', 'tutorialFooter');
    footer.appendChild(controls);
    if (!isLast) footer.appendChild(button('Skip tutorial', 'tutorialSkip', endTutorial));

    tooltip.setAttribute('aria-label', step.header);
    tooltipContent.append(head, text, footer);
}

function nextStep() {
    const next = resolveStep(currentStep + 1, 1);
    if (next < 0) endTutorial();
    else showStep(next);
}

function previousStep() {
    const previous = resolveStep(currentStep - 1, -1);
    if (previous >= 0) showStep(previous);
}

/**
 * @param {!Element} el
 * @param {number} left
 * @param {number} top
 * @param {number=} width
 * @param {number=} height
 */
function setBox(el, left, top, width, height) {
    el.style.setProperty('--tutX', `${Math.round(left)}px`);
    el.style.setProperty('--tutY', `${Math.round(top)}px`);
    if (width != null) el.style.setProperty('--tutW', `${Math.round(width)}px`);
    if (height != null) el.style.setProperty('--tutH', `${Math.round(height)}px`);
}

function placeSpotlight(rect) {
    setBox(spotlight,
        rect.left - SPOTLIGHT_PADDING,
        rect.top - SPOTLIGHT_PADDING,
        rect.width + SPOTLIGHT_PADDING * 2,
        rect.height + SPOTLIGHT_PADDING * 2);
}

function placeTooltip(rect) {
    const viewWidth = document.documentElement.clientWidth;
    const viewHeight = document.documentElement.clientHeight;
    const box = tooltip.getBoundingClientRect();
    const width = box.width, height = box.height;
    const gap = SPOTLIGHT_PADDING + TOOLTIP_GAP;

    const left = Math.max(rect.left, 0), right = Math.min(rect.right, viewWidth);
    const top = Math.max(rect.top, 0), bottom = Math.min(rect.bottom, viewHeight);
    const centreX = left + (right - left) / 2, centreY = top + (bottom - top) / 2;

    const candidates = {
        right: [right + gap, centreY - height / 2],
        left: [left - gap - width, centreY - height / 2],
        bottom: [centreX - width / 2, bottom + gap],
        top: [centreX - width / 2, top - gap - height]
    };

    let best = null, bestVisible = -1;
    for (const placement of [tutorialSteps[currentStep].placement, ...FALLBACK_PLACEMENTS]) {
        const candidate = candidates[placement];
        if (!candidate) continue;
        const [x, y] = candidate;

        if (x >= VIEWPORT_MARGIN && y >= VIEWPORT_MARGIN
            && x + width <= viewWidth - VIEWPORT_MARGIN && y + height <= viewHeight - VIEWPORT_MARGIN) {
            best = candidate;
            break;
        }

        const visible = Math.max(0, Math.min(x + width, viewWidth) - Math.max(x, 0))
            * Math.max(0, Math.min(y + height, viewHeight) - Math.max(y, 0));
        if (visible > bestVisible) {
            bestVisible = visible;
            best = candidate;
        }
    }

    setBox(tooltip,
        clamp(best[0], VIEWPORT_MARGIN, viewWidth - width - VIEWPORT_MARGIN),
        clamp(best[1], VIEWPORT_MARGIN, viewHeight - height - VIEWPORT_MARGIN));
}

function clamp(value, low, high) {
    return Math.min(Math.max(value, low), Math.max(low, high));
}

function reposition() {
    if (!running || currentStep < 0 || !spotlight) return;
    const rect = targetRect();
    if (!rect) return;

    spotlight.classList.add('is-instant');
    placeSpotlight(rect);
    placeTooltip(rect);

    clearTimeout(instantTimer);
    instantTimer = setTimeout(() => spotlight?.classList.remove('is-instant'), 120);
}

function activeRoot() {
    return tooltip ?? overlay;
}

function focusable() {
    const root = activeRoot();
    return root ? Array.from(root.querySelectorAll('button')).filter((b) => !b.disabled) : [];
}

function focusFirst() {
    focusable()[0]?.focus();
}

function focusPrimary() {
    (primaryButton?.isConnected ? primaryButton : focusable()[0])?.focus();
}

function listen(target, type, listener) {
    target.addEventListener(type, listener, true);
    boundListeners.push([target, type, listener]);
}

function blockPage() {
    state.disableKeyBinds();

    const swallow = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    listen(window, 'keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'escape') {
            swallow(e);
            endTutorial();
        } else if (key === 'tab') {
            const items = focusable();
            if (items.length === 0) return;
            const index = items.indexOf(document.activeElement);
            const next = e.shiftKey
                ? items[index <= 0 ? items.length - 1 : index - 1]
                : items[(index < 0 || index === items.length - 1) ? 0 : index + 1];
            swallow(e);
            next.focus();
        } else if (currentStep >= 0 && (key === 'arrowright' || key === 'arrowleft')) {
            swallow(e);
            if (key === 'arrowright') nextStep();
            else previousStep();
        } else {
            e.stopPropagation();
        }
    });

    for (const type of ['keyup', 'keypress']) listen(window, type, (e) => e.stopPropagation());
    for (const type of ['paste', 'drop']) listen(window, type, swallow);
    for (const type of ['dragover', 'dragenter', 'dragleave', 'dragend']) {
        listen(window, type, (e) => {
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
            swallow(e);
        });
    }

    listen(document, 'focusin', (e) => {
        const root = activeRoot();
        if (root && !root.contains(e.target)) focusFirst();
    });

    listen(window, 'resize', reposition);
    listen(window, 'scroll', reposition);
}

function unblockPage() {
    for (const [target, type, listener] of boundListeners) target.removeEventListener(type, listener, true);
    boundListeners = [];
    state.enableKeyBinds();
}
