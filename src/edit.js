'use strict';

import { createPopup, clearPopups } from "./popups.js";

// safari check
const safari = !('filter' in CanvasRenderingContext2D.prototype);

const safariInverse = (canvas) => {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const l = data.length;
    for (let i = 0; i < l; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
    }
    ctx.putImageData(imageData, 0, 0);
};

export const getPerspectiveMatrix = (p0, p1, p2, p3) => {
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const dy3 = p0.y - p1.y + p2.y - p3.y;

    if (Math.abs(dx3) < 1e-7 && Math.abs(dy3) < 1e-7) {
        return {
            /** @export */ a11: p1.x - p0.x, /** @export */ a21: p3.x - p0.x, /** @export */ a31: p0.x,
            /** @export */ a12: p1.y - p0.y, /** @export */ a22: p3.y - p0.y, /** @export */ a32: p0.y,
            /** @export */ a13: 0,          /** @export */ a23: 0
        };
    }

    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-7) {
        return {
            /** @export */ a11: p1.x - p0.x, /** @export */ a21: p3.x - p0.x, /** @export */ a31: p0.x,
            /** @export */ a12: p1.y - p0.y, /** @export */ a22: p3.y - p0.y, /** @export */ a32: p0.y,
            /** @export */ a13: 0,          /** @export */ a23: 0
        };
    }

    const g = (dx3 * dy2 - dx2 * dy3) / det;
    const h = (dx1 * dy3 - dx3 * dy1) / det;

    return {
        /** @export */ a11: p1.x - p0.x + g * p1.x,
        /** @export */ a21: p3.x - p0.x + h * p3.x,
        /** @export */ a31: p0.x,
        /** @export */ a12: p1.y - p0.y + g * p1.y,
        /** @export */ a22: p3.y - p0.y + h * p3.y,
        /** @export */ a32: p0.y,
        /** @export */ a13: g,
        /** @export */ a23: h
    };
};

export const mapPerspectivePoint = (m, u, v) => {
    const denom = m.a13 * u + m.a23 * v + 1;
    const invDenom = Math.abs(denom) > 1e-7 ? 1.0 / denom : 1.0;
    return {
        /** @export */ x: (m.a11 * u + m.a21 * v + m.a31) * invDenom,
        /** @export */ y: (m.a12 * u + m.a22 * v + m.a32) * invDenom
    };
};

export const isQuadConvex = (p0, p1, p2, p3) => {
    const cp = (a, b, c) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const z0 = cp(p0, p1, p2);
    const z1 = cp(p1, p2, p3);
    const z2 = cp(p2, p3, p0);
    const z3 = cp(p3, p0, p1);
    return (z0 > 0 && z1 > 0 && z2 > 0 && z3 > 0) || (z0 < 0 && z1 < 0 && z2 < 0 && z3 < 0);
};

export const applyPerspectiveWarp = (srcCanvas, dstCanvas, corners, outW, outH) => {
    const srcCtx = srcCanvas.getContext('2d');
    const dstCtx = dstCanvas.getContext('2d');
    const srcW = srcCanvas.width;
    const srcH = srcCanvas.height;

    const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
    const srcData = srcImageData.data;
    const dstImageData = dstCtx.createImageData(outW, outH);
    const dstData = dstImageData.data;

    const m = getPerspectiveMatrix(corners[0], corners[1], corners[2], corners[3]);
    const invW = 1.0 / (outW > 1 ? outW - 1 : 1);
    const invH = 1.0 / (outH > 1 ? outH - 1 : 1);

    let outIdx = 0;
    for (let y = 0; y < outH; y++) {
        const vn = y * invH;
        const a21_vn_a31 = m.a21 * vn + m.a31;
        const a22_vn_a32 = m.a22 * vn + m.a32;
        const a23_vn_1 = m.a23 * vn + 1;

        for (let x = 0; x < outW; x++) {
            const un = x * invW;
            const denom = m.a13 * un + a23_vn_1;
            const invDenom = Math.abs(denom) > 1e-7 ? 1.0 / denom : 1.0;
            const sx = (m.a11 * un + a21_vn_a31) * invDenom;
            const sy = (m.a12 * un + a22_vn_a32) * invDenom;

            if (sx >= 0 && sx <= srcW - 1 && sy >= 0 && sy <= srcH - 1) {
                const x0 = Math.floor(sx);
                const y0 = Math.floor(sy);
                const x1 = Math.min(x0 + 1, srcW - 1);
                const y1 = Math.min(y0 + 1, srcH - 1);
                const fx = sx - x0;
                const fy = sy - y0;
                const fx1 = 1 - fx;
                const fy1 = 1 - fy;

                const w00 = fx1 * fy1;
                const w10 = fx * fy1;
                const w01 = fx1 * fy;
                const w11 = fx * fy;

                const idx00 = (y0 * srcW + x0) * 4;
                const idx10 = (y0 * srcW + x1) * 4;
                const idx01 = (y1 * srcW + x0) * 4;
                const idx11 = (y1 * srcW + x1) * 4;

                dstData[outIdx]     = (w00 * srcData[idx00]     + w10 * srcData[idx10]     + w01 * srcData[idx01]     + w11 * srcData[idx11]) | 0;
                dstData[outIdx + 1] = (w00 * srcData[idx00 + 1] + w10 * srcData[idx10 + 1] + w01 * srcData[idx01 + 1] + w11 * srcData[idx11 + 1]) | 0;
                dstData[outIdx + 2] = (w00 * srcData[idx00 + 2] + w10 * srcData[idx10 + 2] + w01 * srcData[idx01 + 2] + w11 * srcData[idx11 + 2]) | 0;
                dstData[outIdx + 3] = (w00 * srcData[idx00 + 3] + w10 * srcData[idx10 + 3] + w01 * srcData[idx01 + 3] + w11 * srcData[idx11 + 3]) | 0;
            } else {
                dstData[outIdx] = 0;
                dstData[outIdx + 1] = 0;
                dstData[outIdx + 2] = 0;
                dstData[outIdx + 3] = 0;
            }
            outIdx += 4;
        }
    }
    dstCtx.putImageData(dstImageData, 0, 0);
};

export function openImageEditModal(image, imageQueue, globalCanvas) {
    if (!image.isValid()) {
        void createPopup('No valid image selected');
        return;
    }

    const img_w = image.naturalWidth;
    const img_h = image.naturalHeight;

    const elem = document.createElement('div');
    const header = document.createElement('h3');
    const edit_buttons = document.createElement('div');
    const img_wrapper = document.createElement('div');
    const img = document.createElement('img');
    elem.id = 'editContainer';
    elem.append(header, edit_buttons, img_wrapper);
    img_wrapper.append(img);
    img_wrapper.classList.add('cropWrapper');
    img.draggable = false;
    header.textContent = 'Edit Image';
    img.src = image.src;

    const activeFilters = new Set();
    const filters = !safari ? {
        /** @export */ Invert: {
            property: 'invert',
            default: 1,
            unit: '',
        },
        /** @export */ Brightness: {
            property: 'brightness',
            default: 120,
            unit: '%',
            description: 'Enter value for brightness in %',
            validate: (v) => Math.max(0, v)
        },
        /** @export */ Contrast: {
            property: 'contrast',
            default: 120,
            unit: '%',
            description: 'Enter value for contrast in %',
            validate: (v) => Math.max(0, v)
        },
        /** @export */ Saturate: {
            property: 'saturate',
            default: 120,
            unit: '%',
            description: 'Enter value for saturation in %',
            validate: (v) => Math.max(0, v)
        },
        /** @export */ Hue: {
            property: 'hue-rotate',
            default: 5,
            unit: 'deg',
            description: 'Enter value for hue rotation in degrees',
            validate: (v) => Math.abs(v) % 360
        },
    } : {
        /** @export */ Invert: {
            property: 'invert',
            default: 1,
            unit: '',
        }
    };

    const removeFilter = (filter) => {
        img.style.filter = img.style.filter.replaceAll(new RegExp(`${filter}\\(.*\\)`, 'g'), '');
    };

    for (const filter in filters) {
        const button = document.createElement('button');
        button.textContent = filter;
        button.classList.add('standardButton');
        edit_buttons.appendChild(button);
        const f = filters[filter];
        button.addEventListener('click', () => {
            if (activeFilters.has(filter)) {
                activeFilters.delete(filter);
                removeFilter(f.property || 'invert');
                button.removeAttribute('active');
                button.textContent = filter;
            } else {
                if (f.validate) {
                    const input = document.createElement('input');
                    input.placeholder = f.default;
                    input.type = 'number';
                    const things = [document.createTextNode(f.description), input];
                    things.serialise = () => input.value || f.default;
                    createPopup(things, {overlay: true}).then((v) => {
                        if (v !== false && Number.isFinite(Number(v))) {
                            v = f.validate(v);
                            activeFilters.add(filter);
                            img.style.filter += `${f.property}(${v}${f.unit})`;
                            button.setAttribute('active', '');
                            button.textContent = `${filter}: ${v}${f.unit}`;
                        } else if (v !== false) {
                            void createPopup('Invalid value.', {overlay: true});
                        }
                    });
                } else {
                    activeFilters.add(filter);
                    img.style.filter += `${f.property || 'invert'}(${f.default ?? 1}${f.unit ?? ''})`;
                    button.setAttribute('active', '');
                    button.textContent = `${filter} (On)`;
                }
            }
        });
    }

    // 3D Transform tool
    let isTransformActive = false;
    let corners = [
        { /** @export */ x: 0,     /** @export */ y: 0 },
        { /** @export */ x: img_w, /** @export */ y: 0 },
        { /** @export */ x: img_w, /** @export */ y: img_h },
        { /** @export */ x: 0,     /** @export */ y: img_h }
    ];

    const transformButton = document.createElement('button');
    transformButton.textContent = '3D Transform';
    transformButton.classList.add('standardButton');
    edit_buttons.appendChild(transformButton);

    const resetGridButton = document.createElement('button');
    resetGridButton.textContent = 'Reset Grid';
    resetGridButton.classList.add('standardButton');
    resetGridButton.style.display = 'none';
    edit_buttons.appendChild(resetGridButton);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svgOverlay = document.createElementNS(svgNS, 'svg');
    svgOverlay.setAttribute('class', 'transformOverlay');
    svgOverlay.setAttribute('viewBox', `0 0 ${img_w} ${img_h}`);
    svgOverlay.setAttribute('preserveAspectRatio', 'none');
    svgOverlay.style.display = 'none';

    const quadPolygon = document.createElementNS(svgNS, 'polygon');
    quadPolygon.setAttribute('class', 'transformQuad');
    svgOverlay.appendChild(quadPolygon);

    const gridLinesGroup = document.createElementNS(svgNS, 'g');
    svgOverlay.appendChild(gridLinesGroup);

    const SUBDIVS = 4;
    const gridLinesH = [];
    const gridLinesV = [];
    for (let i = 1; i < SUBDIVS; i++) {
        const lineH = document.createElementNS(svgNS, 'line');
        lineH.setAttribute('class', 'transformGridLine');
        gridLinesGroup.appendChild(lineH);
        gridLinesH.push(lineH);

        const lineV = document.createElementNS(svgNS, 'line');
        lineV.setAttribute('class', 'transformGridLine');
        gridLinesGroup.appendChild(lineV);
        gridLinesV.push(lineV);
    }

    const handleLabels = ['TL', 'TR', 'BR', 'BL'];
    const handleGroups = [];
    for (let i = 0; i < 4; i++) {
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'transformHandle');
        g.dataset['index'] = i.toString();

        const touchCircle = document.createElementNS(svgNS, 'circle');
        touchCircle.setAttribute('class', 'transformHandleTouch');
        touchCircle.setAttribute('r', '22');

        const coreCircle = document.createElementNS(svgNS, 'circle');
        coreCircle.setAttribute('class', 'transformHandleCore');
        coreCircle.setAttribute('r', '7');

        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('class', 'transformHandleText');
        text.textContent = handleLabels[i];
        const dx = (i === 0 || i === 3) ? -16 : 16;
        const dy = (i === 0 || i === 1) ? -16 : 16;
        text.setAttribute('x', dx.toString());
        text.setAttribute('y', dy.toString());

        g.append(touchCircle, coreCircle, text);
        svgOverlay.appendChild(g);
        handleGroups.push(g);
    }

    img_wrapper.appendChild(svgOverlay);

    const updateTransformOverlay = () => {
        if (!isTransformActive) return;

        const convex = isQuadConvex(corners[0], corners[1], corners[2], corners[3]);
        if (convex) {
            quadPolygon.classList.remove('invalid');
        } else {
            quadPolygon.classList.add('invalid');
        }

        quadPolygon.setAttribute('points', `${corners[0].x},${corners[0].y} ${corners[1].x},${corners[1].y} ${corners[2].x},${corners[2].y} ${corners[3].x},${corners[3].y}`);

        const m = getPerspectiveMatrix(corners[0], corners[1], corners[2], corners[3]);

        for (let i = 1; i < SUBDIVS; i++) {
            const vn = i / SUBDIVS;
            const pL = mapPerspectivePoint(m, 0, vn);
            const pR = mapPerspectivePoint(m, 1, vn);
            const lineH = gridLinesH[i - 1];
            lineH.setAttribute('x1', pL.x.toString());
            lineH.setAttribute('y1', pL.y.toString());
            lineH.setAttribute('x2', pR.x.toString());
            lineH.setAttribute('y2', pR.y.toString());

            const un = i / SUBDIVS;
            const pT = mapPerspectivePoint(m, un, 0);
            const pB = mapPerspectivePoint(m, un, 1);
            const lineV = gridLinesV[i - 1];
            lineV.setAttribute('x1', pT.x.toString());
            lineV.setAttribute('y1', pT.y.toString());
            lineV.setAttribute('x2', pB.x.toString());
            lineV.setAttribute('y2', pB.y.toString());
        }

        const rect = svgOverlay.getBoundingClientRect();
        const dispW = rect.width > 0 ? rect.width : (img.clientWidth > 0 ? img.clientWidth : (img_wrapper.clientWidth > 0 ? img_wrapper.clientWidth : 0));
        const scale = dispW > 0 ? (img_w / dispW) : 1;

        for (let i = 0; i < 4; i++) {
            const g = handleGroups[i];
            g.setAttribute('transform', `translate(${corners[i].x}, ${corners[i].y}) scale(${scale})`);
        }
    };

    let draggingHandle = null;

    for (let i = 0; i < 4; i++) {
        const g = handleGroups[i];
        g.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            draggingHandle = i;
            g.classList.add('dragging');
            try { g.setPointerCapture(e.pointerId); } catch {}
        });

        g.addEventListener('pointermove', (e) => {
            if (draggingHandle === i) {
                e.preventDefault();
                e.stopPropagation();
                const rect = svgOverlay.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const mouseX = ((e.clientX - rect.left) / rect.width) * img_w;
                    const mouseY = ((e.clientY - rect.top) / rect.height) * img_h;
                    corners[i].x = Math.max(0, Math.min(img_w, mouseX));
                    corners[i].y = Math.max(0, Math.min(img_h, mouseY));
                    updateTransformOverlay();
                }
            }
        });

        const stopDrag = (e) => {
            if (draggingHandle === i) {
                e.preventDefault();
                g.classList.remove('dragging');
                draggingHandle = null;
                try { g.releasePointerCapture(e.pointerId); } catch {}
            }
        };

        g.addEventListener('pointerup', stopDrag);
        g.addEventListener('pointercancel', stopDrag);
    }

    transformButton.addEventListener('click', () => {
        isTransformActive = !isTransformActive;
        if (isTransformActive) {
            transformButton.setAttribute('active', '');
            resetGridButton.style.display = '';
            svgOverlay.style.display = '';
            requestAnimationFrame(updateTransformOverlay);
        } else {
            transformButton.removeAttribute('active');
            resetGridButton.style.display = 'none';
            svgOverlay.style.display = 'none';
        }
    });

    resetGridButton.addEventListener('click', () => {
        corners = [
            { /** @export */ x: 0,     /** @export */ y: 0 },
            { /** @export */ x: img_w, /** @export */ y: 0 },
            { /** @export */ x: img_w, /** @export */ y: img_h },
            { /** @export */ x: 0,     /** @export */ y: img_h }
        ];
        updateTransformOverlay();
    });

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
        if (isTransformActive) updateTransformOverlay();
    }) : null;
    ro?.observe(img_wrapper);
    ro?.observe(img);

    const onResize = () => {
        if (isTransformActive) updateTransformOverlay();
    };
    window.addEventListener('resize', onResize);

    const buttons = document.createElement('div');
    buttons.classList.add('popupButtons');
    const cancel = document.createElement('button'), confirm = document.createElement('button');
    cancel.classList.add('standardButton');
    cancel.textContent = 'Cancel';
    confirm.classList.add('standardButton');
    confirm.textContent = 'Save';
    buttons.append(cancel, confirm);
    cancel.addEventListener('click', clearPopups);

    confirm.addEventListener('click', () => {
        const isModified = corners[0].x !== 0 || corners[0].y !== 0 ||
                           corners[1].x !== img_w || corners[1].y !== 0 ||
                           corners[2].x !== img_w || corners[2].y !== img_h ||
                           corners[3].x !== 0 || corners[3].y !== img_h;

        const globalCtx = globalCanvas.getContext('2d');

        if (isTransformActive && isModified) {
            if (!isQuadConvex(corners[0], corners[1], corners[2], corners[3])) {
                void createPopup('Invalid corners: 3D grid must form a non-overlapping quadrilateral.', {overlay: true});
                return;
            }

            const dTop = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
            const dBottom = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
            const dLeft = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
            const dRight = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);
            const outW = Math.max(10, Math.round(Math.max(dTop, dBottom)));
            const outH = Math.max(10, Math.round(Math.max(dLeft, dRight)));

            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = img_w;
            srcCanvas.height = img_h;
            const srcCtx = srcCanvas.getContext('2d');

            if (!safari) srcCtx.filter = img.style.filter;
            srcCtx.drawImage(img, 0, 0);
            if (!safari) srcCtx.filter = 'none';

            globalCanvas.width = outW;
            globalCanvas.height = outH;
            applyPerspectiveWarp(srcCanvas, globalCanvas, corners, outW, outH);

            if (safari) safariInverse(globalCanvas);
        } else {
            globalCanvas.width = img_w;
            globalCanvas.height = img_h;

            if (!safari) globalCtx.filter = img.style.filter;
            globalCtx.drawImage(img, 0, 0);
            if (!safari) globalCtx.filter = 'none';

            if (safari) safariInverse(globalCanvas);
        }

        const currentlySelected = imageQueue.currentlySelected();
        globalCanvas.toBlob((b) => {
            imageQueue.addImage(b, URL.createObjectURL(b), true);
            currentlySelected?.__usytrace_remove();
            clearPopups();

            globalCanvas.width = 0;
            globalCanvas.height = 0;
        });
    });

    void createPopup(elem, {
        buttons,
        onclose: () => {
            window.removeEventListener('resize', onResize);
            ro?.disconnect();
        }
    });
}

export function initImageEdit(image, imageQueue, globalCanvas) {
    document.getElementById('editImage')?.addEventListener('click', () => {
        openImageEditModal(image, imageQueue, globalCanvas);
    });
}
