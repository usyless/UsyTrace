'use strict';

// Defaults
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

// Global Variables
let sizeRatio, width, height, CURRENT_MODE = null;

const glass = document.getElementById('glass');
glass.setColour = (colour) => {
    glass.style.backgroundColor = `rgb(${colour})`;
}

const lines = {
    parent: document.getElementById('lines'),
    lines: {
        xHigh: document.getElementById('xHigh'),
        xLow: document.getElementById('xLow'),
        yHigh: document.getElementById('yHigh'),
        yLow: document.getElementById('yLow'),
    },
    updateLinePosition: (line, position) => {
        const attr = line.dataset.direction;
        line.nextElementSibling.setAttribute(attr, position);
        line.setAttribute(`${attr}1`, position);
        line.setAttribute(`${attr}2`, position);
    },
    updateLineWidth: () => {
        for (const line of lines.parent.querySelectorAll('line')) line.setAttribute('stroke-width', sizeRatio);
        for (const text of lines.parent.querySelectorAll('text')) text.setAttribute('font-size', `${1.3 * sizeRatio}em`);
    },
    getPosition: (line) => parseFloat(line.getAttribute(`${line.dataset.direction}1`)),
    setPosition: (line, position) => {
        const ls = lines.lines, otherLinePos = lines.getPosition(ls[line.dataset.other]), sizeAttr = line.dataset.direction === 'x' ? width : height;
        if (line === ls.xHigh || line === ls.yLow) lines.updateLinePosition(line, Math.max(otherLinePos + 1, Math.min(sizeAttr - 1, position)));
        else lines.updateLinePosition(line, Math.max(1, Math.min(otherLinePos - 1, position)));
    },
    showLines: () => lines.parent.classList.remove('hidden'),
    hideLines: () => lines.parent.classList.add('hidden'),
    initialiseTextPosition: () => {
        lines.lines.xHigh.nextElementSibling.setAttribute('y', height / 2);
        lines.lines.xLow.nextElementSibling.setAttribute('y', height / 2);
        lines.lines.yHigh.nextElementSibling.setAttribute('x', width / 2);
        lines.lines.yLow.nextElementSibling.setAttribute('x', width / 2);
    },
    initialise: () => {
        for (const name in lines.lines) {
            const line = lines.lines[name], [otherDir, sizeAttr] = line.dataset.direction === 'x' ? ['y', height] : ['x', width];
            line.setAttribute(`${otherDir}1`, 0);
            line.setAttribute(`${otherDir}2`, sizeAttr);
        }
        lines.initialiseTextPosition();
    }
}
lines.lineArray = [lines.lines.xHigh, lines.lines.xLow, lines.lines.yHigh, lines.lines.yLow];

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
image.saveLines = () => {
    const imageData = imageMap.get(image.src), lineData = {};
    if (imageData) {
        for (const name in lines.lines) lineData[name] = lines.getPosition(lines.lines[name]);
        imageData.lines = lineData;
    }
}
image.loadLines = () => {
    const prev = imageMap.get(image.src).lines;
    for (const name in lines.lines) lines.setPosition(lines.lines[name], prev[name]);
    lines.initialise();
    lines.showLines();
}

const preferences = {
    SPLHigher: () => document.getElementById('SPLHigher').value,
    SPLLower: () => document.getElementById('SPLLower').value,
    FRHigher: () => document.getElementById('FRHigher').value,
    FRLower: () => document.getElementById('FRLower').value,

    snapToLines: () => document.getElementById('snapToLines').checked,

    colourTolerance: () => document.getElementById('colourTolerance').value || defaults.colourTolerance,
    maxLineHeightOffset: () => document.getElementById('maxLineHeightOffset').value || defaults.maxLineHeightOffset,
    largestContiguousJumpOffset: () => document.getElementById('maxJumpOffset').value || defaults.maxJumpOffset,

    PPO: () => document.getElementById('PPO').value || defaults.ppo,
    delimitation: () => document.getElementById('delimitation').value || defaults.delimitation,
    lowFRExport: () => document.getElementById('lowFRExport').value || defaults.lowFRExport,
    highFRExport: () => document.getElementById('highFRExport').value || defaults.highFRExport,
}

const worker = {
    worker: (() => {
        let worker = new Worker("./worker.js");
        worker.onmessage = (e) => {
            const data = e.data, imgData = imageMap.get(data.src);

            if (data.svg) imgData.path = data.svg;
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
                if (data.type === 'getPixelColour') glass.setColour(data.pixelColour);
                else if (data.type === 'snapLine') lines.setPosition(lines.lines[data.line.name], data.line.position);
                else graphs.setTracePath(data.svg, data.colour, height * 0.005);
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
    clearTrace: () => {
        worker.worker.postMessage({
            type: 'clearTrace',
            src: image.src,
        });
    },
    undoTrace: () => {
        worker.worker.postMessage({
            type: 'undoTrace',
            src: image.src,
        });
    },
    exportTrace: () => {
        const hasNullOrEmpty = (obj) => {
            return Object.values(obj).some(value => {
                if (value && typeof value === 'object') {
                    return hasNullOrEmpty(value);
                }
                return value === null || value === '';
            });
        };
        const data = {
            type: 'exportTrace',
            src: image.src,
            PPO: preferences.PPO(),
            delim: preferences.delimitation(),
            lowFR: preferences.lowFRExport(),
            highFR: preferences.highFRExport(),
            SPL: {
                top: preferences.SPLHigher(),
                topPixel: lines.getPosition(lines.lines.yHigh),
                bottom: preferences.SPLLower(),
                bottomPixel: lines.getPosition(lines.lines.yLow)
            },
            FR: {
                top: preferences.FRHigher(),
                topPixel: lines.getPosition(lines.lines.xHigh),
                bottom: preferences.FRLower(),
                bottomPixel: lines.getPosition(lines.lines.xLow),
            }
        }
        if (hasNullOrEmpty(data)) {
            Popups.createPopup("Please fill in all required values to export (SPL and FR values)");
            return;
        }
        worker.worker.postMessage(data);
    },
    addPoint: (x, y) => {
        worker.worker.postMessage({
            type: 'addPoint',
            src: image.src,
            x: x,
            y: y
        });
    },
    autoTrace: () => {
        worker.worker.postMessage({
            type: 'autoTrace',
            src: image.src,
            maxLineHeightOffset: preferences.maxLineHeightOffset(),
            maxJumpOffset: preferences.largestContiguousJumpOffset(),
            colourTolerance: preferences.colourTolerance(),
        });
    },
    trace: (x, y) => {
        worker.worker.postMessage({
            type: 'trace',
            src: image.src,
            x: x,
            y: y
        });
    },
    snapLine: (line, direction) => {
        worker.worker.postMessage({
            type: 'snapLine',
            src: image.src,
            line: {
                name: line.id,
                position: lines.getPosition(line),
                direction: line.dataset.direction
            },
            direction: direction
        });
    },
    getPixelColour: (x, y) => {
        worker.worker.postMessage({
            type: 'getPixelColour',
            src: image.src,
            x: x,
            y: y
        });
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
        graphs.setTracePath('', '#ff0000', 0);
    },
    clearTracePathAndWorker: () => {
        graphs.clearTracePath();
        worker.clearTrace();
        imageMap.get(image.src).path = '';
    },
}

document.getElementById('autoPath').addEventListener('click', worker.autoTrace);
document.getElementById('undo').addEventListener('click', worker.undoTrace);
document.getElementById('clearPath').addEventListener('click', graphs.clearTracePathAndWorker);
document.getElementById('export').addEventListener('click', worker.exportTrace);

const imageMap = new Map();
const fileInput = document.getElementById('fileInput');
const buttons = {
    resetButtons: () => {
        document.querySelectorAll('[data-default]').forEach((e) => {
            e.textContent = e.dataset.default;
        });
        CURRENT_MODE = null;
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
        const button = t.target, mode = button.dataset.mode, prevMode = {m: CURRENT_MODE}.m;
        buttons.resetButtons();
        if (prevMode === mode) {
            CURRENT_MODE = null;
            lines.showLines();
        } else {
            button.textContent = button.dataset.active;
            CURRENT_MODE = mode;
            lines.hideLines();
        }
    }

    for (const button of MODE_BUTTON_IDS) {
        document.getElementById(button).addEventListener('click', cb);
    }
}
const imageQueue = {
    elem: document.getElementById('imageQueueInner'),
    removeSelectedImage: () => {
        for (const i of imageQueue.elem.querySelectorAll('img[class="selectedImage"]')) i.classList.remove('selectedImage');
    },
    deleteImage: (img) => {
        imageMap.delete(img.src);
        worker.removeImage(img.src);
        img.remove();
    },
    scrollToSelected: () => {
        imageQueue.elem.querySelector('img[class="selectedImage"]').scrollIntoView({inline: 'center', behavior: 'smooth'});
    },
    addImage: (src, display=false) => {
        const img = document.createElement('img'),
            a = document.getElementById('imageQueueInner');
        img.src = src;
        imageMap.set(img.src, {
            initial: true
        });
        img.addEventListener('dragstart', (e) => e.preventDefault());
        img.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            image.saveLines();
            image.src = src;
            imageQueue.removeSelectedImage();
            img.classList.add('selectedImage');
            imageQueue.scrollToSelected();
        });
        img.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (img.classList.contains('selectedImage')) {
                let newImage = img.nextElementSibling;
                if (!newImage) newImage = img.previousElementSibling;
                if (!newImage) initAll();
                else newImage.click();
            }
            imageQueue.deleteImage(img);
        })
        a.appendChild(img);
        if (display) {
            img.click();
            setTimeout(() => imageQueue.scrollToSelected(), 50);
        }
        return img;
    }
}
document.getElementById('removeImage').addEventListener('click', () => document.querySelector('img[class="selectedImage"]').dispatchEvent(new Event('contextmenu')));
document.getElementById('toggleImageQueue').addEventListener('click', (e) => {
    const button = e.target, container = document.getElementById('imageQueueContainer'), imageContainer = document.getElementById('imageContainer');
    if (button.textContent === button.dataset.active) {
        button.textContent = button.dataset.default;
        container.removeAttribute('style');
        imageContainer.classList.remove('expand');
    } else {
        button.textContent = button.dataset.active;
        container.style.marginBottom = '-150px';
        imageContainer.classList.add('expand');
    }
});

// Initialise the page
resetToDefault();
initAll();

fileInput.loadFiles = (files) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/")), lastId = validFiles.length - 1;
    if (validFiles.length > 0) {
        Popups.clearPopups();
        validFiles.forEach((file, index) => {
            file = URL.createObjectURL(file);
            imageQueue.addImage(file, index === lastId);
        });
    }
    else Popups.createPopup("Invalid image/file(s) added!");
}
fileInput.addEventListener('change', (e) => {
    fileInput.loadFiles(e.target.files);
});

image.addEventListener('dragstart',(e) => e.preventDefault());

document.getElementById('fileInputButton').addEventListener('click', () => fileInput.click());

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
    image.addEventListener('pointermove', (e) => {
        e.preventDefault();
        const parentRect = image.parentElement.getBoundingClientRect(), m = image.getMouseCoords(e);
        glass.style.left = `${m.x - parentRect.left}px`;
        glass.style.top = `${m.y - parentRect.top}px`;
        worker.getPixelColour(m.xRel * sizeRatio, m.yRel * sizeRatio);
        glass.classList.remove('hidden');
    });
    multiEventListener(['pointerup', 'pointerleave', 'pointerout', 'pointercancel'], image, () => glass.classList.add('hidden'));
}

{ // Move canvas lines
    let selectedLine = null, getCoords = image.getMouseCoords;

    lines.parent.addEventListener('pointerdown', (e) => {
        const m = getCoords(e);
        const sizes = {
            x: width * 0.02,
            y: height * 0.02
        }
        for (const line of lines.lineArray) line.offset = m[`${line.dataset.direction}Rel`] * sizeRatio - lines.getPosition(line);
        const closest = lines.lineArray.reduce((acc, curr) => Math.abs(curr.offset) < Math.abs(acc.offset) ? curr : acc, lines.lineArray[0]);
        if (Math.abs(closest.offset) < sizes[closest.dataset.direction]) selectedLine = closest;
    });

    lines.parent.addEventListener('pointermove', (e) => {
        if (selectedLine) lines.setPosition(selectedLine, getCoords(e)[`${selectedLine.dataset.direction}Rel`] * sizeRatio - selectedLine.offset);
    });

    multiEventListener(['pointerup', 'pointerleave', 'pointercancel'], lines.parent, (e) => {
        e.preventDefault();
        selectedLine = null;
    });
}

{ // Move canvas lines with buttons
    let holdInterval, line, speed, snap = preferences.snapToLines();
    document.getElementById('snapToLines').addEventListener('change', () => snap = preferences.snapToLines());

    document.querySelectorAll(".moveButtons button").forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            line = lines.lines[e.target.parentNode.dataset.for];
            speed = parseInt(e.target.dataset.direction);
            if (snap) worker.snapLine(line, speed);
            else {
                holdInterval = setInterval(() => {
                    lines.setPosition(line, lines.getPosition(line) + speed * sizeRatio);
                }, 10);
            }
        });

        multiEventListener(['pointerup', 'pointerleave', 'pointerout', 'pointercancel'], btn, (e) => {
            e.preventDefault();
            clearInterval(holdInterval);
        });
    });
}

window.addEventListener('resize', () => {
    updateSizeRatio();
    lines.updateLineWidth();
});

// where everything starts
image.addEventListener('load', () => {
    document.getElementById('defaultMainText').classList.add('hidden');
    buttons.enableButtons();
    buttons.resetButtons();
    width = image.naturalWidth;
    height = image.naturalHeight;
    graphs.updateSize();
    graphs.clearTracePath();
    updateSizeRatio();

    const imageData = imageMap.get(image.src);
    if (imageData.initial) {
        worker.addImage(image.src, width, height);
        imageData.path = '';
        lines.setPosition(lines.lines.xHigh, width);
        lines.setPosition(lines.lines.xLow, 0);
        lines.setPosition(lines.lines.yHigh, 0);
        lines.setPosition(lines.lines.yLow, height);
        lines.initialise();
        lines.showLines();
        imageData.initial = false;
        // SNAP LINES
        // AUTO TRACE
    } else {
        image.loadLines();
        graphs.setTracePath(imageData.path, imageData.colour, height * 0.005);
    }
    lines.updateLineWidth();
});

// Helper Functions
function multiEventListener(events, target, callback) {
    if (typeof (events) !== "object") events = [events];
    events.forEach((ev) => target.addEventListener(ev, callback));
}

function initAll() {
    document.getElementById('defaultMainText').classList.remove('hidden');
    document.querySelectorAll('[data-disabled]').forEach((elem) => {elem.disabled = true;});
    lines.hideLines();
    buttons.resetButtons();
    image.src = ''
}

function updateSizeRatio() {
    sizeRatio = width / image.clientWidth;
}

// HTML function
function minVal(e) {
    if (e.value < e.min) e.value = e.min;
}