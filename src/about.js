'use strict';

import { createPopup } from "./popups.js";

document.getElementById("about").addEventListener('click', () => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('popupInner', 'about');
    const logoWrapper = document.createElement('div');
    let logoWrapperRect = null;
    const logo = document.createElement('div');
    logo.classList.add('logo');
    logoWrapper.appendChild(logo);
    logoWrapper.classList.add('logoWrapper');

    { // logo stuff
        const wall1 = document.createElement('div');
        const wall2 = document.createElement('div');
        const wall3 = document.createElement('div');
        wall1.classList.add('wall');
        wall2.classList.add('wall');
        wall3.classList.add('wall');

        const lineWrapper = document.createElement('div');
        for (let i = 0; i < 16; ++i) {
            const line = document.createElement('div');
            line.style.setProperty('--i', i);
            lineWrapper.appendChild(line);
        }
        lineWrapper.classList.add('line');

        logo.append(wall1, wall2, wall3, lineWrapper);
        let timer, transitioned;
        logoWrapper.addEventListener('pointermove', (e) => {
            if (e.target === e.currentTarget) {
                clearTimeout(timer);
                logoWrapperRect = logoWrapperRect ?? logoWrapper.getBoundingClientRect();
                logo.style.setProperty('--dy', `${((e.clientX - logoWrapperRect.left) - (logoWrapperRect.width / 2)) / 5}deg`);
                logo.style.setProperty('--dx', `${((logoWrapperRect.height / 2) - (e.clientY - logoWrapperRect.top)) / 5}deg`);
                if (transitioned == null) {
                    logo.classList.add('quick');
                    transitioned = setTimeout(() => {
                        logo.classList.add('no-transition');
                        logo.classList.remove('quick');
                    }, 200);
                }
            }
        });
        const reset = () => {
            clearTimeout(transitioned);
            transitioned = null;
            timer = setTimeout(() => {
                logo.classList.remove('quick');
                logo.classList.remove('no-transition');
                logo.style.removeProperty('--dx');
                logo.style.removeProperty('--dy');
            }, 100);
        };
        logoWrapper.addEventListener('pointerleave', reset);
        logoWrapper.addEventListener('dragstart', (e) => e.preventDefault());
    }

    const innerWrapper = document.createElement('div');
    innerWrapper.classList.add('popupInner');
    const meText = document.createElement('h2');
    meText.textContent = 'UsyTrace';
    const lower = document.createElement('h3');
    lower.textContent = 'made with ❤️ by usy';

    const smallest = document.createElement('h6');
    smallest.textContent = 'i made the 3d icon while procrastinating studying for exams, try hovering over it or dragging it';

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

    innerWrapper.append(meText, lower, contact, discord, email, github, smallest);
    wrapper.append(logoWrapper, innerWrapper);

    createPopup(wrapper, {listeners: [
        {target: window, type: 'resize', listener: () => {
        logoWrapperRect = logoWrapper.getBoundingClientRect();
    }}]});
});