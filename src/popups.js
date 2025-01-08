'use strict';

const eventListeners = [];
const onclosefuncs = [];

export async function createPopup(content, {listeners = [], buttons, classes = [], onclose} = {}) {
    clearPopups();
    return new Promise((resolve) => {
        const center_div = document.createElement('div'),
            main_div = document.createElement('div'),
            inner_div = document.createElement('div');

        center_div.setAttribute('usy-overlay', '');
        center_div.classList.add('fullscreen', 'blur');
        main_div.classList.add('popupOuter', ...classes);
        inner_div.classList.add('popupInner', ...classes);

        const innerContent = [];
        if (typeof content === 'string') {
            const text_div = document.createElement('div');
            text_div.classList.add('popupText');
            text_div.textContent = content;
            innerContent.push(text_div);
        } else if (Array.isArray(content)) {
            innerContent.push(...content);
        } else {
            innerContent.push(content);
        }

        main_div.appendChild(inner_div);

        let buttons_div;

        if (buttons != null) {
            buttons_div = buttons;
        } else {
            buttons_div = document.createElement('div');
            buttons_div.classList.add('popupButtons');
            const ok_button = document.createElement('button');
            ok_button.classList.add('standardButton');
            ok_button.textContent = 'Ok';

            buttons_div.appendChild(ok_button);

            ok_button.addEventListener('click', () => {
                clearPopups();
                resolve(true);
            });
        }
        inner_div.append(...innerContent, buttons_div);

        center_div.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                clearPopups();
                resolve(false);
            }
        });

        center_div.appendChild(main_div);

        for (const listener of listeners) {
            eventListeners.push(listener);
            listener.target.addEventListener(listener.type, listener.listener);
        }

        if (onclose != null) onclosefuncs.push(onclose);
        document.body.appendChild(center_div);
    });
}

export function clearPopups() {
    for (const listener of eventListeners) listener.target?.removeEventListener?.(listener.type, listener.listener);
    for (const f of onclosefuncs) f();
    onclosefuncs.length = 0;
    eventListeners.length = 0;
    document.querySelectorAll('[usy-overlay]').forEach((e) => e.remove());
}
