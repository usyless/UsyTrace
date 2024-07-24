const js = document.createElement('script');
if (window.localStorage.getItem('update') === 'true') {
    const t = performance.timeOrigin.toString();
    js.setAttribute('src', `trace.js?${t}`);
    window.localStorage.removeItem('update');
    window.localStorage.setItem('trace', t);
}
else js.setAttribute('src', `trace.js?${window.localStorage.getItem('trace')}`);
document.body.appendChild(js);