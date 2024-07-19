'use strict';

// show site out of date alert
const VERSION = 2;
(async () => {
    let r = await fetch('https://usyless.pythonanywhere.com/api/version', {cache: 'no-store'});
    if (r.status === 200) {
        r = await r.json();
        if (VERSION < parseInt(r['v'])) document.getElementById('updateAvailable').classList.remove('hidden');
    }
})();

// global constants
let lineSVG = document.getElementById('lines');

const imageMap = new Map(),
    image = document.getElementById('uploadedImage'),
    main = document.getElementById('main'),
    fileInput = document.getElementById('imageInput'),
    state = State(),
    defaults = {
        "colourTolerance": 67,
        "maxLineHeightOffset": 0,
        "maxJumpOffset": 0,

        "PPO": 48,
        "delimitation": "tab",
        "lowFRExport": 20,
        "highFRExport": 20000,

        "SPLTop": "",
        "SPLBot": "",
        "FRTop": "",
        "FRBot": ""
    };

// create global variables
let worker, lines, sizeRatio, imageData, width, height;

// call initial functions
restoreDefault();
createWorker();
state.toInitial();

// assign event listeners
multiEventListener('dragstart', image, (e) => e.preventDefault());

{ // Drag and drop stuff
    multiEventListener('dragover', main, (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy';
        main.classList.add('lowOpacity');
    });
    multiEventListener(['dragleave', 'dragend'], main, (e) => {
        e.preventDefault();
        main.classList.remove('lowOpacity');
    });
    multiEventListener('drop', main, (e) => {
        e.preventDefault();
        main.classList.remove('lowOpacity');
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
    });
}

{ // magnifying glass stuff
    const glass = document.getElementById('glass');
    multiEventListener(['mousemove'], image, (e) => {
        e.preventDefault();
        const parentRect = image.parentElement.getBoundingClientRect(), m = getMouseCoords(e),
            v = (Math.floor((m.yRel) * sizeRatio) * image.naturalWidth * 4) + (Math.floor((m.xRel) * sizeRatio) * 4);
        glass.style.left = `${m.x - parentRect.left}px`;
        glass.style.top = `${m.y - parentRect.top}px`;
        glass.style.backgroundColor = `rgb(${imageData[v]}, ${imageData[v + 1]}, ${imageData[v + 2]})`;
        glass.classList.remove('hidden');
    });
    multiEventListener(['mouseup', 'mouseleave', 'mouseout', 'touchend', 'touchcancel'], image, () => glass.classList.add('hidden'));
}

multiEventListener('load', image, () => { // image context switching
    clearPath();
    document.querySelectorAll("[temp_thing='']").forEach((e) => e.classList.add('hidden'));
    document.querySelectorAll("button[class='disableme']").forEach((b) => b.disabled = false);
    width = image.naturalWidth;
    height = image.naturalHeight;
    document.querySelectorAll('svg').forEach((svg) => {
        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    });

    updateSizeRatio();
    const d = imageMap.get(image.src);
    if (d.initial) {
        setUpImageData();
        lines = [
            {pos: width * 0.1, type: "Low", dir: "x", i: 0},
            {pos: width * 0.9, type: "High", dir: "x", i: 1},
            {pos: height * 0.1, type: "High", dir: "y", i: 2},
            {pos: height * 0.9, type: "Low", dir: "y", i: 3}
        ]
        d.d = "";
        d.lines = lines;
        createLines();
        state.snapLines();
        state.autoPath();
        d.initial = false;
    } else {
        imageData = d.imageData;
        lines = d.lines;
        setTracePath(d.d, d.colour, height * 0.005);
    }
    state.imageLoaded();
});

multiEventListener('resize', window, () => {
    updateSizeRatio();
    updateLineWidth();
});

{ // Move lines on image with buttons
    let holdInterval, line, speed, snap = true;
    const snapSetting = document.getElementById('snap');
    updateSnap();

    function updateSnap() {
        snap = snapSetting.checked;
    }

    multiEventListener('change', snapSetting, updateSnap);
    document.querySelectorAll(".moveButtons button").forEach((btn) => {
        multiEventListener(['mousedown', 'touchstart'], btn, (e) => {
            e.preventDefault();
            line = lines[parseInt(e.target.getAttribute("i"))];
            speed = parseInt(e.target.getAttribute("dir"));
            if (snap) state.snapLine(line, speed);
            else {
                holdInterval = setInterval(() => {
                    line.pos += speed;
                    moveLine(line);
                }, 10);
            }
        });

        multiEventListener(['mouseup', 'mouseleave', 'mouseout', 'touchend', 'touchcancel'], btn, (e) => {
            e.preventDefault();
            clearInterval(holdInterval);
        });
    });
}

multiEventListener('click', image, (e) => {
    const m = getMouseCoords(e);
    state.handleImageClick(m.xRel * sizeRatio, m.yRel * sizeRatio);
});

function State() {
    const overlay = document.getElementById('overlay'),
        pointButton = document.getElementById('selectPoint'),
        pathButton = document.getElementById('selectPath');

    function startImageEditing() {
        buttonsToDefault();
        document.querySelectorAll(".moveButtons button").forEach((b) => b.disabled = true);
        image.classList.add("crosshair_hover");
        image.classList.remove("removePointerEvents");
        lineSVG.classList.add("hidden");
    }

    function stopImageEditing() {
        buttonsToDefault();
        document.querySelectorAll(".moveButtons button").forEach((b) => b.disabled = false);
        image.classList.remove("crosshair_hover");
        image.classList.add("removePointerEvents");
        lineSVG.classList.remove("hidden");
        state.updateState(state.States.imageLoaded);
    }

    function buttonsToDefault() {
        [pathButton, pointButton].forEach(btn => {
            btn.disabled = false;
            btn.innerText = btn.getAttribute("def");
        });
    }

    class State {
        States = {
            initial: 0,
            imageLoaded: 1,
            selectingPath: 2,
            selectingPoint: 3
        }
        state = this.States.initial;
        tracing = false;

        updateState(newState) {
            this.state = newState;
        }

        checkState(states) {
            if (typeof (states) !== "object") states = [states];
            for (let s of states) if (s === this.state) return true;
            return false;
        }

        toInitial() {
            if (this.tracing) this.toggleTrace();
            stopImageEditing();
            document.querySelectorAll("[temp_thing='']").forEach((e) => e.classList.remove('hidden'));
            document.querySelectorAll("button[class='disableme']").forEach((b) => b.disabled = true);
            image.src = '';
            clearLines();
            clearPath();
            this.updateState(this.States.initial);
        }

        loadNewImage() {
            if (this.tracing) this.toggleTrace();
            let img;
            stopImageEditing();
            for (const f of fileInput.files) img = createImageQueueItem(URL.createObjectURL(f));
            img.click();
            this.updateState(this.States.imageLoaded);
        }

        imageLoaded() {
            createLines();
            this.updateState(this.States.imageLoaded);
            scrollToSelectedImage();
        }

        snapLines() {
            this.snapLine(lines[0], 1); // move right
            this.snapLine(lines[1], -1); // move left
            this.snapLine(lines[2], 1); // move down
            this.snapLine(lines[3], -1); // move up
        }

        snapLine(line, direction) {
            worker.postMessage({
                src: image.src,
                type: 'snapLine',
                dir: direction,
                line: line
            });
        }

        autoPath() {
            clearPath();
            this.toggleTrace();
            worker.postMessage({
                src: image.src,
                type: 'autoTrace',
                lineHeightOffset: document.getElementById("maxLineHeightOffset").value,
                colourTolerance: document.getElementById("colourTolerance").value,
                maxJumpOffset: document.getElementById("maxJumpOffset").value
            });
        }

        togglePath() {
            if (this.checkState([this.States.imageLoaded, this.States.selectingPoint])) {
                startImageEditing();
                pathButton.innerText = pathButton.getAttribute("alt");
                this.updateState(this.States.selectingPath);
            } else {
                stopImageEditing();
            }
        }

        togglePoint() {
            if (this.checkState([this.States.imageLoaded, this.States.selectingPath])) {
                startImageEditing();
                pointButton.innerText = pointButton.getAttribute("alt");
                this.updateState(this.States.selectingPoint);
            } else {
                stopImageEditing();
            }
        }

        toggleTrace() {
            overlay.classList.toggle("noOpacity");
            main.classList.toggle("lowOpacity");
            main.classList.toggle("not_allowed");
            main.classList.toggle("removePointerEvents");
            this.tracing = !this.tracing;
        }

        handleImageClick(x, y) {
            this.toggleTrace();
            if (this.checkState(this.States.selectingPath)) {
                worker.postMessage({
                    src: image.src,
                    type: 'trace',
                    x: x,
                    y: y,
                    lineHeightOffset: document.getElementById("maxLineHeightOffset").value,
                    colourTolerance: document.getElementById("colourTolerance").value,
                    maxJumpOffset: document.getElementById("maxJumpOffset").value
                });
            } else {
                worker.postMessage({
                    src: image.src,
                    type: 'addPoint',
                    x: x,
                    y: y
                });
            }
        }
    }

    return new State();
}

function clearPath() {
    setTracePath('', '#ff0000', 0);
}

function clearPathAndWorker() {
    clearPath();
    worker.postMessage({src: image.src, type: "clearTrace"});
    const d = imageMap.get(image.src);
    d.d = '';
}

function exportTrace() {
    const SPLTop = document.getElementById("SPLTop").value,
        SPLBot = document.getElementById("SPLBot").value,
        FRTop = document.getElementById("FRTop").value,
        FRBot = document.getElementById("FRBot").value;

    if (!SPLTop || !SPLBot || !FRTop || !FRBot) {
        let btn = document.getElementById("export");
        btn.innerText = "Please Fill in All Values Below (Export Trace)";
        setTimeout(() => btn.innerText = "Export Trace", 5000);
        return;
    }

    worker.postMessage({
        src: image.src,
        type: "exportTrace",
        SPL: {
            top: SPLTop,
            topPixel: lines[2].pos,
            bottom: SPLBot,
            bottomPixel: lines[3].pos
        },
        FR: {
            top: FRTop,
            topPixel: lines[1].pos,
            bottom: FRBot,
            bottomPixel: lines[0].pos,
        },
        lowFR: document.getElementById("lowFRExport").value,
        highFR: document.getElementById("highFRExport").value,
        PPO: document.getElementById("PPO").value,
        delim: document.getElementById("delimitation").value
    });
}

function updateSizeRatio() {
    sizeRatio = width / image.clientWidth;
}

function createWorker() {
    if (!worker) {
        worker = new Worker("./worker.js");
        worker.onmessage = (e) => {
            const d = e.data, imgData = imageMap.get(d.src);

            if (d.svg) imgData.d = d.svg;
            if (d.line) imgData.lines[d.line.i] = d.line;
            if (d.colour) imgData.colour = d.colour;

            if (d.type === 'exportTrace') {
                const a = document.createElement("a"),
                    url = URL.createObjectURL(new Blob([d.export], {type: "text/plain;charset=utf-8"}));
                a.href = url;
                a.download = "trace.txt";
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 0);
            } else if (d.src === image.src) {
                if (d.type === 'snapLine') {
                    const newLine = d.line, line = lines[newLine.i];
                    line.pos = newLine.pos;
                    moveLine(line);
                } else {
                    setTracePath(d.svg, d.colour, height * 0.005);
                    state.toggleTrace();
                }
            }
        }
    }
}

function multiEventListener(events, target, callback) {
    if (typeof (events) !== "object") events = [events];
    events.forEach((ev) => target.addEventListener(ev, callback));
}

function setTracePath(d, colour, width) {
    const path = document.getElementById('trace').firstElementChild;
    path.setAttribute('d', d);
    path.setAttribute('stroke', colour);
    path.setAttribute('stroke-width', width);
}

function createSVGLine(x1, y1, x2, y2, colour, width) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', colour);
    line.setAttribute('stroke-width', width);
    return line;
}

function createSVGText(text, x, y) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.textContent = text;
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('font-size', `${1.3 * sizeRatio}em`);
    return t;
}

function moveLine(line) {
    const l = lineSVG.querySelector(`line[dir="${line.dir}"][type="${line.type}"]`);
    if (line.dir === 'x') {
        line.pos = Math.floor(Math.max(1, Math.min(width - 1, line.pos)));
        updateLine(l, line, line.pos, '0', line.pos, height);
    } else {
        line.pos = Math.floor(Math.max(1, Math.min(height - 1, line.pos)));
        updateLine(l, line, '0', line.pos, width, line.pos);
    }
}

function updateLineWidth() {
    for (const line of lineSVG.querySelectorAll('line')) line.setAttribute('stroke-width', sizeRatio);
    for (const text of lineSVG.querySelectorAll('text')) text.setAttribute('font-size', `${1.3 * sizeRatio}em`);
}

function updateLine(l, line, x1, y1, x2, y2) {
    l.nextElementSibling.setAttribute(line.dir, line.pos);
    l.setAttribute('x1', x1);
    l.setAttribute('y1', y1);
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
}

function clearLines() {
    const newSvg = lineSVG.cloneNode(false);
    lineSVG.parentElement.replaceChild(newSvg, lineSVG);
    lineSVG = newSvg;
}

function createLines() {
    clearLines();

    { // Move canvas lines with mouse
        let selectedLine = null, offset = 0;
        const sizes = {
            x: width,
            y: height
        }

        multiEventListener('mousedown', lineSVG, (e) => {
            const m = getMouseCoords(e);

            for (const line of lines) {
                offset = m[`${line.dir}Rel`] * sizeRatio - line.pos;
                if (Math.abs(offset) < sizes[line.dir] * 0.02) {
                    selectedLine = line;
                    return;
                }
            }
        });

        multiEventListener('mousemove', lineSVG, (e) => {
            if (selectedLine) {
                const m = getMouseCoords(e);
                selectedLine.pos = Math.floor(m[`${selectedLine.dir}Rel`] * sizeRatio - offset);
                moveLine(selectedLine);
            }
        });

        multiEventListener(['mouseup', 'mouseleave'], lineSVG, (e) => {
            e.preventDefault();
            selectedLine = null;
        });
    }

    for (const line of lines) {
        let l, t;
        if (line.dir === "x") {
            l = createSVGLine(line.pos, "0", line.pos, height, 'green', sizeRatio);
            t = createSVGText(line.type, line.pos, height / 2);
        } else {
            l = createSVGLine("0", line.pos, width, line.pos, 'blue', sizeRatio);
            t = createSVGText(line.type, width / 2, line.pos);
        }
        l.setAttribute("dir", line.dir);
        l.setAttribute("type", line.type);
        lineSVG.appendChild(l);
        lineSVG.appendChild(t);
    }
}

function getMouseCoords(e) {
    const r = image.getBoundingClientRect(), x = e.clientX, y = e.clientY;
    return {
        x: x,
        y: y,
        xRel: x - r.left,
        yRel: y - r.top
    }
}

function setUpImageData() {
    let processing_canvas = document.createElement("canvas"),
        processing_context = processing_canvas.getContext('2d'),
        new_image = new Image;
    processing_canvas.width = width;
    processing_canvas.height = height;
    new_image.src = image.src;
    processing_context.drawImage(new_image, 0, 0);
    imageData = processing_context.getImageData(0, 0, new_image.naturalWidth, new_image.naturalHeight);
    worker.postMessage({
        src: image.src,
        type: 'setData',
        data: imageData.data,
        width: imageData.width,
        height: imageData.height
    }, [imageData.data.buffer]);
    // duplicate copy because silly but prevents the other thing being copied
    imageData = processing_context.getImageData(0, 0, new_image.naturalWidth, new_image.naturalHeight).data;
    imageMap.get(image.src).imageData = imageData;
}

// HTML Functions
function minVal(e) {
    if (e.value < e.min) e.value = e.min;
}

function undo() {
    if (worker) {
        state.toggleTrace();
        worker.postMessage({src: image.src, type: "undoTrace"});
    }
}

function restoreDefault() {
    for (const val in defaults) document.getElementById(val).value = defaults[val];
}

function toggleImageQueue(b) {
    const m = document.getElementById('imageQueueOuter'),
        n = m.firstElementChild;
    if (m.getAttribute('style')) {
        b.innerText = 'Hide';
        m.removeAttribute('style');
        setTimeout(() => n.removeAttribute('style'), 300);
    } else {
        b.innerText = 'Show';
        n.style.minHeight = n.clientHeight + 'px';
        n.style.height = n.clientHeight + 'px';
        n.style.maxHeight = n.clientHeight + 'px';
        m.style.height = '0px';
    }
}

function removeSelectedImage() {
    for (const i of document.querySelectorAll('img[class="selectedImage"]')) i.classList.remove('selectedImage');
}

function createImageQueueItem(src) {
    const img = document.createElement('img'),
        a = document.getElementById('imageQueueInner');
    img.src = src;
    imageMap.set(img.src, {
        initial: true
    });
    img.addEventListener('dragstart', (e) => e.preventDefault());
    img.addEventListener('click', (e) => {
        state.toInitial();
        e.preventDefault();
        e.stopPropagation();
        image.src = src;
        removeSelectedImage();
        img.classList.add('selectedImage');
    });
    img.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (img.classList.contains('selectedImage')) {
            let newImage = img.nextElementSibling;
            if (!newImage) newImage = img.previousElementSibling;
            if (!newImage) state.toInitial();
            else newImage.click();
        }
        deleteImage(img);
    })
    a.appendChild(img);
    return img;
}

function deleteImage(img) {
    imageMap.delete(img.src);
    worker.postMessage({src: img.src, type: 'removeImage'});
    img.remove();
}

function removeImage() {
    document.querySelector('img[class="selectedImage"]').dispatchEvent(new Event('contextmenu'));
}

function scrollToSelectedImage() {
    document.querySelector('img[class="selectedImage"]').scrollIntoView({inline: 'center'});
}