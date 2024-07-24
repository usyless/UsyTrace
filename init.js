const js = document.createElement('script');
if (window.localStorage.getItem('update') === 'true') {
    js.setAttribute('src', 'trace.js?update');
    window.localStorage.removeItem('update');
}
else js.setAttribute('src', 'trace.js');
document.body.appendChild(js);