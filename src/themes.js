const themes = {
    /** @export */
    dark: {
        icon: '🌑',
        next: 'light'
    },
    /** @export */
    light: {
        icon: '☀️',
        next: 'funky'
    },
    /** @export */
    funky: {
        icon: '💻',
        next: 'dark'
    }
}

const nextTheme = (theme) => themes[theme.next];

let timer;
document.getElementById('themeSwitch').addEventListener('click', () => {
    clearTimeout(timer);

    let currTheme;
    for (const c of document.documentElement.classList) {
        if (c.startsWith('theme-')) {
            currTheme = c.replaceAll('theme-', '');
            if (themes[currTheme]) break;
        }
    }

    const curr = themes[currTheme];
    document.getElementById('themeSwitch').textContent = nextTheme(curr).icon;

    document.documentElement.classList.add('theme-transition');
    document.documentElement.classList.remove(`theme-${currTheme}`);
    document.documentElement.classList.add(`theme-${curr.next}`);
    window.localStorage.setItem('theme', curr.next);
    timer = setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
    }, 200);
});

for (const c of document.documentElement.classList) {
    if (c.startsWith('theme-')) {
        document.getElementById('themeSwitch').textContent = themes[c.replaceAll('theme-', '')].icon;
        break;
    }
}