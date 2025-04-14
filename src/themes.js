import { createPopup, clearPopups } from "./popups.js";

const themes = {
    /** @export */ default: '➡️💻 Follow system',
    /** @export */ dark: '🌑 Default dark',
    /** @export */ light: '☀️ Default light',
    /** @export */ "solarized-dark": '🟦 Solarized dark',
    /** @export */ "solarized-light": '🍨 Solarized light'
}

const currentTheme = () => {
    for (const c of document.documentElement.classList) {
        if (c.startsWith('theme-')) return c.replaceAll('theme-', '');
    }
}

let timer;
const switchToTheme = (theme) => {
    for (const c of Array.from(document.documentElement.classList)) {
        if (c.startsWith('theme-')) document.documentElement.classList.remove(c);
    }

    clearTimeout(timer);
    document.documentElement.classList.add('transition-theme');
    timer = setTimeout(() => {
        document.documentElement.classList.remove('transition-theme');
    }, 200);

    if (theme === 'default') window.localStorage.removeItem('theme');
    else window.localStorage.setItem('theme', theme);

    window.dispatchEvent(new CustomEvent('themeChange'));
}

document.getElementById('themeSwitch').addEventListener('click', () => {
    const inner = document.createElement('div'),
        title = document.createElement('h3');

    inner.classList.add('themePopupInner');
    title.textContent = 'Theme';
    inner.appendChild(title);
    for (const theme in themes) {
        const t = document.createElement('button');
        t.classList.add('standardButton');
        t.textContent = themes[theme];
        t.dataset["theme"] = theme;
        inner.appendChild(t);
    }
    const curr = inner.querySelector(`[data-theme="${currentTheme()}"]`);
    if (curr) {
        curr.classList.add('active');
        curr.textContent += ' - current';
    }
    inner.addEventListener('click', (e) => {
        const theme = e.target.closest("[data-theme]")?.dataset?.["theme"];
        if (theme) {
            switchToTheme(theme);
            clearPopups();
        }
    });
    createPopup(inner, {buttons: "Exit", classes: ["themePopup"]});
});
