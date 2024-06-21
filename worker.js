'use strict';

const RGB = hoistRGB(), Image = hoistImage(), ExportString = hoistExportString(), Trace = hoistTrace(),
    Lines = hoistLines(), ImageMap = new (hoistImageMap())(),
    typeMap = {
        removeImage: () => ImageMap.delete(),
        setData: () => void(0),

        clearTrace: () => image.clearTrace(),
        undoTrace: () => image.undoTrace(),

        exportTrace: () => image.exportTrace(),

        addPoint: () => image.addPoint(),
        autoTrace: () => image.autoTrace(),
        trace: () => image.trace(),

        snapLine: () => image.snapLine()
    }

let d, imageData, currentTrace, image, backgroundColour;

onmessage = (e) => {
    d = e.data;
    ImageMap.get()
    const r = typeMap[d.type]();
    if (r) {
        r.type = d.type;
        r.src = d.src;
        postMessage(r);
    }
}

function hoistImageMap() {
    class ImageMap {
        images = new Map();

        get() {
            image = this.images.get(d.src);
            if (!image) this.new();
            imageData = image.imgData;
            currentTrace = image.currentTrace;
            backgroundColour = image.backgroundColour;
        }

        delete() {
            this.images.delete(d.src);
        }

        new() {
            imageData = d.imageData;
            image = new Image();
            this.images.set(d.src, image);
        }
    }
    return ImageMap;
}

function hoistImage() {
    class Image {
        currentTrace = {
            trace: new Map(),
            colour: '#ff0000'
        };
        traceHistory = [];

        constructor() {
            this.src = d.src;
            this.imgData = imageData;
            this.backgroundColour = getApproximateBackgroundColour();
        }

        trace() {
            this.saveCurrentTrace();
            Trace.trace(this.currentTrace.trace);
            return this.traceReturn();
        }

        autoTrace() {
            this.saveCurrentTrace();
            Trace.auto();
            return this.traceReturn();
        }

        addPoint() {
            this.saveCurrentTrace();
            Trace.addPoint(parseInt(d.x), parseInt(d.y));
            return this.traceReturn();
        }

        undoTrace() {
            const l = this.traceHistory.pop();
            if (l) {
                this.currentTrace.trace = l.trace;
                this.currentTrace.colour = l.colour;
            }
            return this.traceReturn();
        }

        clearTrace() {
            this.currentTrace.trace.clear();
            this.currentTrace.colour = '#ff0000';
        }

        snapLine() {
            return {line: Lines.snapLine()};
        }

        exportTrace() {
            return {export: Trace.export()};
        }

        saveCurrentTrace() {
            this.traceHistory.push({trace: new Map(JSON.parse(JSON.stringify(Array.from(this.currentTrace.trace)))), colour: this.currentTrace.colour});
        }

        traceReturn() {
            return {svg: Trace.toSVG(), colour: this.currentTrace.colour};
        }
    }
    return Image;
}

function hoistTrace() {
    class Trace {
        static trace(base) { // base as map
            const x = parseInt(d.x), y = parseInt(d.y), w = imageData.width, h = imageData.height,
                maxLineHeight = Math.max(0, Math.floor(h * 0.05) + parseIntDefault(d.maxLineHeightOffset, 0)),
                maxJump = Math.max(0, Math.floor(w * 0.02)) + parseIntDefault(d.maxJumpOffset, 0),
                colour = new RGB(RGB.getRGB(x, y), d.colourTolerance);
            trace(x, -1);
            trace(x + 1, 1);
            return {
                trace: base,
                colour: colour.getTraceColour()
            }

            function trace(start, step) {
                let n, m = 0, j = y, max, colours;
                for (; start >= 0 && start < w; start += step) {
                    colours = [];
                    max = maxLineHeight + (m * 2);
                    checkPixel(start, j);
                    for (let z = 1; z <= max; z++) {
                        checkPixel(start, j + z);
                        checkPixel(start, j - z);
                    }
                    if (colours.length > 0) {
                        m = 0;
                        for (const c of colours) {
                            m += c;
                            colour.addToAverage(start, c);
                        }
                        j = Math.floor(m / colours.length);
                        m = 0;
                        base.set(start, j);
                        continue;
                    }
                    if (m < maxJump) m++;
                    else break;
                }

                function checkPixel(x, y) {
                    n = Math.max(0, Math.min(h - 1, y));
                    if (colour.withinTolerance(x, n)) colours.push(n);
                }
            }
        }

        static auto() { // only checking middle 40% for now, check outer 40% but with less weight later maybe, also maybe check every possible pixel
            const h = imageData.height, maxYRange = Math.floor(h * 0.2),
                middleY = Math.floor(h / 2), yCond = middleY - maxYRange,
                middleX = Math.floor(imageData.width / 2), traces = [];
            getPotentialTrace((x, y) => RGB.biggestDifference(x, y), 10);
            getPotentialTrace((x, y) => backgroundColour.getDifference(x, y), 10);
            for (const t of traces) if (t.trace.size > currentTrace.trace.size) currentTrace = t;

            function getPotentialTrace(func, tolerance) {
                let bestY, c, currentDiff = 0;
                for (let y = middleY + maxYRange; y > yCond; y--) {
                    c = func(middleX, y);
                    if (c >= tolerance && c > currentDiff) {
                        bestY = y;
                        currentDiff = c;
                    }
                }
                if (bestY) {
                    d.x = middleX;
                    d.y = bestY;
                    traces.push(Trace.trace(new Map()));
                }
            }
        }

        static toSVG() {
            const trace = Trace.clean(currentTrace.trace);
            if (trace.length > 0) {
                let d = 'M' + trace[0][0] + ' ' + trace[0][1];
                for (let i = 1; i < trace.length; i++) d += ' L' + trace[i][0] + ' ' + trace[i][1];
                return d;
            } else return '';
        }

        static addPoint(x, y) {
            currentTrace.trace.set(x, y);
        }

        static export() {
            const lowFR = parseFloat(d.lowFR), highFR = parseFloat(d.highFR),
                FRPrecision = parseInt(d.FRPrecision, 10),
                SPLPrecision = parseInt(d.SPLPrecision, 10);

            // SPL Stuff
            const SPL = d.SPL,
                SPLBot = parseFloat(SPL.bottom), SPLBotPixel = parseFloat(SPL.bottomPixel),
                // (top SPL value - bottom SPL value) / (top SPL pixel - bottom SPL pixel)
                SPLRatio = (parseFloat(SPL.top) - SPLBot) / (parseFloat(SPL.topPixel) - SPLBotPixel);

            // FR Stuff
            const FR = d.FR,
                FRBotPixel = parseFloat(FR.bottomPixel), logFRBot = Math.log10(parseFloat(FR.bottom)),
                // (log10(top FR value) - log10(bottom FR value)) / (top FR pixel - bottom FR pixel)
                FRRatio = (Math.log10(parseFloat(FR.top)) - logFRBot) / (parseFloat(FR.topPixel) - FRBotPixel);

            const export_string = new ExportString(d.delim), FRxSPL = [],
                PPO = Math.log10(Math.pow(2, 1 / parseInt(d.PPO, 10)));

            for (const [x, y] of Trace.clean(currentTrace.trace, imageData)) FRxSPL.push([Math.pow(10, ((parseFloat(x) - FRBotPixel) * FRRatio) + logFRBot), ((parseFloat(y) - SPLBotPixel) * SPLRatio) + SPLBot]);

            const splFunc = contiguousLinearInterpolation(FRxSPL), h = Math.log10(highFR);
            for (let v = Math.log10(lowFR); ; v += PPO) {
                const freq = Math.pow(10, v);
                export_string.addData(freq.toFixed(FRPrecision), splFunc(freq).toFixed(SPLPrecision));
                if (v >= h) break;
            }

            return export_string.data;
        }

        static clean() {
            let trace = currentTrace.trace, simplifiedTrace = [];
            if (trace.size > 0) {
                trace = new Map([...trace.entries()].sort((a, b) => a[0] - b[0]));
                if (trace.size > 2) {
                    let z, avg, n = trace.entries().next().value[0], identity = [], finalKey, finalValue;
                    simplifiedTrace.push([n, trace.get(n)]);
                    const l = imageData.width;
                    for (let i = n + 1; i < l; i++) {
                        z = trace.get(i);
                        if (z) {
                            finalValue = z;
                            identity = [];
                            let j = i
                            do {
                                finalKey = j;
                                identity.push(j);
                                j++;
                            } while (trace.get(j) === z)
                            if (identity.length === 1) {
                                simplifiedTrace.push([i, z]);
                            } else {
                                avg = identity.reduce((a, b) => a + b, 0) / identity.length;
                                simplifiedTrace.push([avg, z]);
                                i += identity.length - 1;
                            }
                        }
                    }
                    if (simplifiedTrace[simplifiedTrace.length - 1][0] !== finalKey) simplifiedTrace.push([finalKey, finalValue]);
                } else simplifiedTrace = Array.from(trace);
            }
            return simplifiedTrace;
        }
    }
    return Trace;
}

function hoistLines() {
    class Lines {
        static snapLine() {
            const line = d.line, y = line.dir === "y", valid = [],
                s = y ? imageData.width : imageData.height, z = y ? imageData.height : imageData.width,
                func = y ? (x, y) => [y, x] : (x, y) => [x, y];

            customFor(Math.floor(line.pos), z, d.dir, Math.floor(s * 0.2), Math.floor(s * 0.8), func);

            if (valid.length > 0) {
                let sum = 0;
                for (const v of valid) sum += v;
                line.pos = sum / valid.length;
            }

            return line;

            // find local minima/maxima rather than global, don't use background colour

            function customFor(start, max, direction, lower, upper, func) {
                const bound = Math.floor(0.9 * (upper - lower));
                start += (Math.floor(max * 0.01) * direction); // CALCULATE JUMP DISTANCE BETTER (find average width of all lines?)
                for (let i = start; i < max && i >= 0; i += direction) {
                    if (lineColourInTolerance(i, lower, upper, bound, func)) valid.push(i);
                    else if (valid.length > 0) break;
                }
            }

            function lineColourInTolerance(pos, lowerBound, upperBound, bound, func) {
                let trueCount = 0;
                for (let j = upperBound; j > lowerBound; j--) if (!backgroundColour.withinTolerance(...func(pos, j))) trueCount++; // potentially store every difference and do some sort of L1/L2 norm
                return trueCount >= bound;
            }
        }
    }
    return Lines;
}

function hoistRGB() {
    class RGB {
        values = 1;
        constructor([r, g, b], tolerance) {
            this.R = r;
            this.G = g;
            this.B = b;
            this.tolerance = tolerance;
        }

        withinTolerance(x, y) {
            return this.getDifference(x, y) <= this.tolerance;
        }

        getDifference(x, y) {
            const [newR, newG, newB] = RGB.getRGB(x, y), rmean = (this.R + newR) / 2,
                r = this.R - newR, g = this.G - newG, b = this.B - newB;
            return Math.sqrt((((512 + rmean) * r * r) >> 8) + 4 * g * g + (((767 - rmean) * b * b) >> 8));
        }

        addToAverage(x, y) {
            const [newR, newG, newB] = RGB.getRGB(x, y);
            this.R += (Math.sqrt((Math.pow(this.R, 2) + Math.pow(newR, 2)) / 2) - this.R) / this.values;
            this.G += (Math.sqrt((Math.pow(this.G, 2) + Math.pow(newG, 2)) / 2) - this.G) / this.values;
            this.B += (Math.sqrt((Math.pow(this.B, 2) + Math.pow(newB, 2)) / 2) - this.B) / this.values;
            this.values++;
        }

        getTraceColour() {
            const s = Math.min(this.R, this.G, this.B);
            if (s === this.R) return '#ff0000';
            return '#00ff7b';
        }

        static biggestDifference(x, y) {
            const [R, G, B] = RGB.getRGB(x, y);
            return Math.max(R, G, B) - Math.min(R, G, B);
        }

        static getRGB(x, y) {
            const v = (y * imageData.width * 4) + (x * 4);
            return [imageData.data[v], imageData.data[v + 1], imageData.data[v + 2]];
        }
    }
    return RGB;
}

function hoistExportString() {
    class ExportString {
        data = '';

        constructor(delim = "tab") {
            if (delim === "tab") {
                this.delim = "\t";
            } else {
                this.delim = " ";
            }
            this.data = `* Exported with UsyTrace, available at https://usyless.github.io/trace
* Freq(Hz)${this.delim}SPL(dB)`;
        }

        addData(freq, spl) {
            this.data += `
${freq.toString()}${this.delim}${spl.toString()}`
        }
    }
    return ExportString;
}

function getApproximateBackgroundColour() {
    const colours = {}, w = imageData.width, h = imageData.height,
        xJump = Math.floor(w * 0.01), yJump = Math.floor(h * 0.01);
    for (let x = 0; x < w; x += xJump) for (let y = 0; y < h; y += yJump) {
        const bg = RGB.getRGB(x, y);
        if (colours[bg]) colours[bg]++;
        else colours[bg] = 1;
    }
    let most = 0, colour;
    for (const c in colours) {
        const d = colours[c];
        if (d > most) {
            most = d;
            colour = c;
        }
    }
    return new RGB(JSON.parse(`[${colour}]`), 10);
}

function parseIntDefault(a, def) {
    let i = parseInt(a, 10);
    if (i) return i;
    return def;
}

function contiguousLinearInterpolation(FRxSPL) {
    const firstF = FRxSPL[0][0], lastF = FRxSPL[FRxSPL.length - 1][0], firstV = FRxSPL[0][1],
        lastV = FRxSPL[FRxSPL.length - 1][1], l = FRxSPL.length;

    let i = 0;

    return (f) => {
        if (f <= firstF) return firstV;
        else if (f >= lastF) return lastV;
        else {
            let lower, upper;
            for (; i < l; i++) {
                if (FRxSPL[i][0] < f) lower = FRxSPL[i];
                else if (FRxSPL[i][0] > f) {
                    upper = FRxSPL[i];
                    i--;
                    break;
                }
            }
            if (lower[1] === upper[1]) return lower[1];
            return ((upper[1] - lower[1]) * ((f - lower[0]) / (upper[0] - lower[0]))) + lower[1];
        }
    }
}