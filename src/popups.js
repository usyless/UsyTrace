(() => {
    /**
     * Create a custom popup, that will go away once "ok" is clicked
     * @param textContent text to be shown inside the popup
     * @param confirmation whether to add cancel button that returns false
     */
    async function createPopup(textContent, confirmation = false) {
        return new Promise((resolve) => {
            const page_overlay = document.createElement('div'),
                center_div = document.createElement('div'),
                main_div = document.createElement('div'),
                inner_div = document.createElement('div'),
                text_div = document.createElement('div'),
                buttons_div = document.createElement('div'),
                ok_button = document.createElement('button'),
                cancel_button = document.createElement('button');

            page_overlay.classList.add('fullscreen', 'dim');
            center_div.classList.add('fullscreen');
            main_div.classList.add('popupOuter');
            inner_div.classList.add('popupInner');
            buttons_div.classList.add('popupButtons');
            text_div.classList.add('popupText');
            ok_button.classList.add('standardButton');
            cancel_button.classList.add('standardButton');

            ok_button.textContent = 'Ok';
            cancel_button.textContent = 'Cancel';

            main_div.appendChild(inner_div);
            inner_div.append(text_div, buttons_div);
            buttons_div.appendChild(ok_button);
            if (confirmation) buttons_div.appendChild(cancel_button);

            ok_button.addEventListener('click', () => {
                page_overlay.remove();
                center_div.remove();
                resolve(true);
            });
            cancel_button.addEventListener('click', () => {
                page_overlay.remove();
                center_div.remove();
                resolve(false);
            });

            text_div.textContent = textContent;

            center_div.appendChild(main_div);

            document.body.appendChild(page_overlay);
            document.body.appendChild(center_div);
        });
    }

    window.Popups = {
        createPopup: createPopup,
    }
})();