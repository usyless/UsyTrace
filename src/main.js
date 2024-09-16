'use strict';

// Global Variables
let sizeRatio, width, height, CURRENT_MODE = null;

const lines = {
    parent: document.getElementById('lines'),
    lines: {
        xHigh: document.getElementById('xHigh'),
        xLow: document.getElementById('xLow'),
        yHigh: document.getElementById('yHigh'),
        yLow: document.getElementById('yLow'),
    },
    lineArray: [lines.lines.xHigh, lines.lines.xLow, lines.lines.yHigh, lines.lines.yLow],
    updateLinePosition: (line, position) => {
        const attr = line.dataset.direction
        line.nextElementSibling.setAttribute(attr, position);
        line.setAttribute(`${attr}1`, position);
        line.setAttribute(`${attr}2`, position);
    },
    updateLineWidth: (line, width) => {
        for (const line of lines.parent.querySelectorAll('line')) line.setAttribute('stroke-width', sizeRatio);
        for (const text of lines.parent.querySelectorAll('text')) text.setAttribute('font-size', `${1.3 * sizeRatio}em`);
    },
    getPosition: (line) => parseFloat(line.getAttribute(`${line.dataset.direction}1`)),
    setPosition: (line, position) => {
        const ls = lines.lines, otherLinePos = lines.getPosition(ls[line.dataset.other]);
        if (line === ls.xHigh || line === ls.yLow) lines.updateLinePosition(line, Math.max(otherLinePos + 1, Math.min(width - 1, position)));
        else lines.updateLinePosition(line, Math.max(1, Math.min(otherLinePos - 1, position)));
    },
    showLines: () => lines.parent.classList.remove('hidden'),
    hideLines: () => lines.parent.classList.add('hidden'),
    initialise: () => {
        // TODO: set text params from image
    }
}

const image = document.getElementById('uploadedImage');
image.getMouseCoords = (e) => {
    const r = image.getBoundingClientRect(), x = e.clientX, y = e.clientY;
    return {
        x: x,
        y: y,
        xRel: x - r.left,
        yRel: y - r.top
    }
}

const preferences = {
    SPLHigher: () => document.getElementById('SPLHigher').value,
    SPLLower: () => document.getElementById('SPLLower').value,
    FRHigher: () => document.getElementById('FRHigher').value,
    FRLower: () => document.getElementById('FRLower').value,

    snapToLines: () => document.getElementById('snapToLines').checked,

    colourTolerance: () => document.getElementById('colourTolerance').value,
    maxLineHeightOffset: () => document.getElementById('maxLineHeightOffset').value,
    largestContiguousJumpOffset: () => document.getElementById('maxJumpOffset').value,

    PPO: () => document.getElementById('PPO').value,
    delimitation: () => document.getElementById('delimitation').value,
    lowFRExport: () => document.getElementById('lowFRExport').value,
    highFRExport: () => document.getElementById('highFRExport').value,
}

const worker = {
    worker: (() => {
        let worker = new Worker("./worker.js");
        // TODO: worker onmessage
        worker.onmessage = (e) => {
            const data = e.data, imgData = imageMap.get(data.src);

            if (data.svg) imgData.d = data.svg;
            if (data.line) imgData.lines[data.line.i] = data.line;
            if (data.colour) imgData.colour = data.colour;

            if (data.type === 'exportTrace') {
                const a = document.createElement("a"),
                    url = URL.createObjectURL(new Blob([data.export], {type: "text/plain;charset=utf-8"}));
                a.href = url;
                a.download = "trace.txt";
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 0);
            } else if (data.src === image.src) {
                if (data.type === 'getPixelColour') glass.style.backgroundColor = `rgb(${data.pixelColour})`;
                else if (data.type === 'snapLine') {
                    const newLine = data.line, line = lines[newLine.i];
                    line.pos = newLine.pos;
                    moveLine(line);
                } else {
                    setTracePath(data.svg, data.colour, height * 0.005);
                    state.toggleTrace();
                }
            }
        }
        return worker;
    })(),
    removeImage: (src) => {
        worker.worker.postMessage({
            type: 'removeImage',
            src: src
        });
    },
    addImage: (src, width, height) => {
        let processing_canvas = document.createElement("canvas"),
            processing_context = processing_canvas.getContext('2d'),
            new_image = new Image;
        processing_canvas.width = width;
        processing_canvas.height = height;
        new_image.src = src;
        processing_context.drawImage(new_image, 0, 0);
        const imageData = processing_context.getImageData(0, 0, new_image.naturalWidth, new_image.naturalHeight);
        worker.worker.postMessage({
            src: src,
            type: 'setData',
            data: imageData.data,
            width: imageData.width,
            height: imageData.height
        }, [imageData.data.buffer]);
    },
    clearTrace: (src) => {
        worker.worker.postMessage({
            type: 'clearTrace',
            src: src,
        });
    },
    undoTrace: (src) => {
        worker.worker.postMessage({
            type: 'undoTrace',
            src: src,
        });
    },
    exportTrace: (src) => {
        worker.worker.postMessage({
            type: 'exportTrace',
            src: src,
            PPO: preferences.PPO(),
            delim: preferences.delimitation(),
            lowFR: preferences.lowFRExport(),
            highFR: preferences.highFRExport(),
            SPL: { // TODO: implement getting value of lines easily
                top: preferences.SPLHigher(),
                topPixel: null,
                bottom: preferences.SPLLower(),
                bottomPixel: null
            },
            FR: { // TODO: implement getting value of lines easily
                top: preferences.FRHigher(),
                topPixel: null,
                bottom: preferences.FRLower(),
                bottomPixel: null,
            }
        });
    },
    addPoint: (src, x, y) => {
        worker.worker.postMessage({
            type: 'addPoint',
            src: src,
            x: x,
            y: y
        });
    },
    autoTrace: (src) => {
        worker.worker.postMessage({
            type: 'autoTrace',
            src: src,
            maxLineHeightOffset: preferences.maxLineHeightOffset(),
            maxJumpOffset: preferences.largestContiguousJumpOffset(),
            colourTolerance: preferences.colourTolerance(),
        });
    },
    trace: (src, x, y) => {
        worker.worker.postMessage({
            type: 'trace',
            src: src,
            x: x,
            y: y
        });
    },
    snapLine: () => {
        // TODO: line stuff idk not implemented yet
        throw new Error("Not yet implemented");
    },
    getPixelColour: (src, x, y) => {
        worker.worker.postMessage({
            type: 'getPixelColour',
            src: src,
            x: x,
            y: y
        });
    }
}

const imageMap = new Map();
const fileInput = document.getElementById('fileInput');
const buttons = {
    resetButtons: () => {
        document.querySelectorAll('[data-default]').forEach((e) => {
            e.textContent = e.dataset.default;
        });
    },
    enableButtons: () => {
        document.querySelectorAll('[data-disabled]').forEach((e) => {
            e.disabled = false;
        });
    }
}
{ // Handling modes with buttons
    const MODE_BUTTON_IDS = ['selectPath', 'selectPoint'];
    const cb = (t) => {
        const button = t.target, mode = button.dataset.mode;
        buttons.resetButtons();
        if (CURRENT_MODE === mode) {
            CURRENT_MODE = null;
        } else {
            button.textContent = button.dataset.active;
            CURRENT_MODE = mode;
        }
        document.dispatchEvent(new CustomEvent('modeChange'));
    }

    for (const button of MODE_BUTTON_IDS) {
        button.addEventListener('click', cb);
    }
}
const graphs = {
    updateSize: () => {
        document.querySelectorAll('svg').forEach((e) => {
            e.setAttribute("width", width);
            e.setAttribute("height", height);
            e.setAttribute("viewBox", `0 0 ${width} ${height}`);
        });
    },
    setTracePath: (d, colour, width) => {
        const path = document.getElementById('trace').firstElementChild;
        path.setAttribute('d', d);
        path.setAttribute('stroke', colour);
        path.setAttribute('stroke-width', width);
    },
    clearTracePath: () => {
        this.setTracePath('', '#ff0000', 0);
    },
    clearTracePathAndWorker: () => {
        this.clearTracePath();
        worker.postMessage({src: image.src, type: "clearTrace"});
        imageMap.get(image.src).d = '';
    },
}

// Initialise the page
launch();

fileInput.loadFiles = (files) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (validFiles.length > 0) {
        Popups.clearPopups();
        for (const file of validFiles) {
            console.log(file.name);
        }
    }
    else Popups.createPopup("Invalid image/file(s) added!");
}
fileInput.addEventListener('change', (e) => {
    fileInput.loadFiles(e.target.files);
});

image.addEventListener('dragstart',(e) => e.preventDefault());

{ // Pasting file stuff
    document.addEventListener('paste', (e) => {
        e.preventDefault();
        const d = new DataTransfer();
        for (const item of e.clipboardData.items) if (item.kind === 'file') d.items.add(item.getAsFile());
        fileInput.loadFiles(d.files);
    });
}

{ // Drag and drop stuff
    multiEventListener('dragover', document.body, (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('lowOpacity');
    });
    multiEventListener(['dragleave', 'dragend'], document.body, (e) => {
        e.preventDefault();
        document.body.classList.remove('lowOpacity');
    });
    multiEventListener('drop', document.body, (e) => {
        e.preventDefault();
        document.body.classList.remove('lowOpacity');
        fileInput.loadFiles(e.dataTransfer.files);
    });
}

{ // magnifying glass stuff
    image.addEventListener('mousemove', (e) => {
        e.preventDefault();
        const parentRect = image.parentElement.getBoundingClientRect(), m = image.getMouseCoords(e);
        glass.style.left = `${m.x - parentRect.left}px`;
        glass.style.top = `${m.y - parentRect.top}px`;
        worker.postMessage({
            src: image.src,
            type: 'getPixelColour',
            x: m.xRel * sizeRatio,
            y: m.yRel * sizeRatio
        });
        glass.classList.remove('hidden');
    });
    multiEventListener(['mouseup', 'mouseleave', 'mouseout', 'touchend', 'touchcancel'], image, () => glass.classList.add('hidden'));
}

{ // Move canvas lines with mouse
    let selectedLine = null, getCoords = image.getMouseCoords;

    lines.parent.addEventListener('pointerdown', (e) => {
        const m = getCoords(e);
        const sizes = {
            x: width * 0.02,
            y: height * 0.02
        }
        for (const line of lines.lineArray) line.offset = m[`${line.dataset.direction}Rel`] * sizeRatio - lines.getPosition(line);
        const closest = lines.reduce((acc, curr) => Math.abs(curr.offset) < Math.abs(acc.offset) ? curr : acc, lines[0]);
        if (Math.abs(closest.offset) < sizes[closest.dataset.direction]) selectedLine = closest;
    });

    lines.parent.addEventListener('pointermove', (e) => {
        if (selectedLine) lines.setPosition(selectedLine, getCoords(e)[`${selectedLine.dir}Rel`] * sizeRatio - selectedLine.offset);
    });

    multiEventListener(['pointerup', 'pointerleave'], lines.parent, (e) => {
        e.preventDefault();
        selectedLine = null;
    });
}

window.addEventListener('resize', () => {
    updateSizeRatio();
    lines.updateLineWidth();
});

// where everything starts
image.addEventListener('load', (e) => {
    document.getElementById('defaultMainText').classList.add('hidden');
    buttons.enableButtons();
    width = image.naturalWidth;
    height = image.naturalHeight;
    graphs.updateSize();
});
function resetToDefault() {
    for (const val in defaults) document.getElementById(val).value = defaults[val];
}

// Helper Functions
function multiEventListener(events, target, callback) {
    if (typeof (events) !== "object") events = [events];
    events.forEach((ev) => target.addEventListener(ev, callback));
}

function initAll() {
    document.getElementById('defaultMainText').classList.remove('hidden');
    document.querySelectorAll('[data-disabled]').forEach((elem) => {elem.disabled = true;});
    document.querySelectorAll('line').forEach((elem) => elem.classList.add('hidden'));
    buttons.resetButtons();
    resetToDefault();
}

function launch() {
    initAll();
    for (const line of graphs.lines) {
        if (line.dataset.diretion === "x") line.pos = () => line.getAttribute('x1');
        else line.pos = () => line.getAttribute('y1');
    }
}

function updateSizeRatio() {
    sizeRatio = width / image.clientWidth;
}

// HTML function
function minVal(e) {
    if (e.value < e.min) e.value = e.min;
}

// Defaults
(() => {
    const defaults = {
        "FRHigher": 20000,
        "FRLower": 20,

        "colourTolerance": 67,
        "maxLineHeightOffset": 0,
        "maxJumpOffset": 0,

        "PPO": 48,
        "delimitation": "tab",
        "lowFRExport": 20,
        "highFRExport": 20000,

        "SPLHigher": "",
        "SPLLower": "",
    }
    document.getElementById('restoreDefault').addEventListener('click', () => {
        resetToDefault();
        Popups.createPopup("Restored settings to default");
    });
    function resetToDefault() {
        for (const val in defaults) document.getElementById(val).value = defaults[val];
    }
    window.resetToDefault = resetToDefault;
})();