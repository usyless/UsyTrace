'use strict';

export async function createPopup(textContent, customTextElem) {
    clearPopups();
    return new Promise((resolve) => {
        const center_div = document.createElement('div'),
            main_div = document.createElement('div'),
            inner_div = document.createElement('div'),
            buttons_div = document.createElement('div'),
            ok_button = document.createElement('button');
        let text_div = document.createElement('div');

        center_div.setAttribute('usy-overlay', '');
        center_div.classList.add('fullscreen', 'blur');
        main_div.classList.add('popupOuter');
        inner_div.classList.add('popupInner');
        buttons_div.classList.add('popupButtons');
        if (textContent != null) {
            text_div.classList.add('popupText');
            text_div.textContent = textContent;
        } else text_div = customTextElem;
        ok_button.classList.add('standardButton');

        ok_button.textContent = 'Ok';

        main_div.appendChild(inner_div);
        inner_div.append(text_div, buttons_div);
        buttons_div.appendChild(ok_button);

        ok_button.addEventListener('click', () => {
            clearPopups();
            resolve(true);
        });
        center_div.addEventListener('click', () => {
            clearPopups();
            resolve(false);
        });
        main_div.addEventListener('click', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });

        center_div.appendChild(main_div);

        document.body.appendChild(center_div);
    });
}

export function clearPopups() {
    document.querySelectorAll('[usy-overlay]').forEach((e) => e.remove());
}
