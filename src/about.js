'use strict';

import { createPopup } from "./popups.js";

document.getElementById("about").addEventListener('click', () => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('popupInner', 'about');
    const logoWrapper = document.createElement('div');
    const logo = document.createElement('div');
    logo.classList.add('logo');
    logoWrapper.appendChild(logo);

    { // logo stuff
        const wall1 = document.createElement('div');
        const wall2 = document.createElement('div');
        const wall3 = document.createElement('div');
        wall1.classList.add('wall');
        wall2.classList.add('wall');
        wall3.classList.add('wall');

        const corner1 = document.createElement('div');
        const corner2 = document.createElement('div');
        const corner3 = document.createElement('div');
        corner1.classList.add('corner');
        corner2.classList.add('corner');
        corner3.classList.add('corner');

        const lineWrapper = document.createElement('div');
        for (let i = -5; i <= 5; ++i) {
            const line = document.createElement('div');
            line.style.setProperty('--depth', `${i * 2}px`);
            lineWrapper.appendChild(line);
        }
        lineWrapper.classList.add('line');

        logo.append(wall1, wall2, wall3, corner1, corner2, corner3, lineWrapper);

        logoWrapper.addEventListener('pointerdown', (e) => e.stopPropagation());
        logoWrapper.addEventListener('pointermove', (e) => {
            const rect = logoWrapper.getBoundingClientRect();
            logo.style.setProperty('--dy', `${((e.clientX - rect.left) - (rect.width / 2)) / 5}deg`);
            logo.style.setProperty('--dx', `${((rect.height / 2) - (e.clientY - rect.top)) / 5}deg`);
        });
        const reset = () => {
            logo.style.removeProperty('--dx');
            logo.style.removeProperty('--dy');
        };
        logoWrapper.addEventListener('pointerout', reset);
        logoWrapper.addEventListener('pointerleave', reset);
        logoWrapper.addEventListener('pointercancel', reset);
        logoWrapper.addEventListener('dragstart', (e) => e.preventDefault());
    }

    const innerWrapper = document.createElement('div');
    innerWrapper.classList.add('popupInner');
    const meText = document.createElement('h2');
    meText.textContent = 'UsyTrace';
    const lower = document.createElement('h3');
    lower.textContent = 'made with ❤️ by usy';

    const contact = document.createElement('div');
    contact.textContent = 'Find me at:';

    const discord = document.createElement('div');
    discord.textContent = 'Discord: @usy_';
    const email = document.createElement('div');
    const emailLink = document.createElement('a');
    email.textContent = 'Email: ';
    emailLink.href = 'mailto:usy@usyless.uk';
    emailLink.textContent = 'usy@usyless.uk';
    email.appendChild(emailLink);
    const github = document.createElement('div');
    const githubLink = document.createElement('a');
    github.textContent = 'GitHub: ';
    githubLink.href = 'https://github.com/usyless/UsyTrace/issues';
    githubLink.textContent = 'usyless';
    github.appendChild(githubLink);

    innerWrapper.append(meText, lower, contact, discord, email, github);
    wrapper.append(logoWrapper, innerWrapper);

    createPopup(null, wrapper);
});